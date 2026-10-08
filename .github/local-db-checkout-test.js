#!/usr/bin/env node
"use strict";

/*
 * FLIGALIGA real-PostgreSQL checkout/concurrency test.
 *
 * Safety:
 * - Requires FLIGALIGA_DB_CHECKOUT_TEST=1.
 * - Refuses NODE_ENV=production.
 * - NEVER commits application-data changes.
 * - Uses TEMP cart tables so the real cart table is untouched.
 * - Uses product row locks inside transactions, then ROLLBACKs.
 *
 * Run from repository root:
 *   FLIGALIGA_DB_CHECKOUT_TEST=1 node .github/local-db-checkout-test.js
 *
 * Optional:
 *   DB_CHECKOUT_CONCURRENCY=25,50,100
 *   DB_CHECKOUT_HOLD_MS=25
 */

if (process.env.FLIGALIGA_DB_CHECKOUT_TEST !== "1") {
  throw new Error("Refusing to run. Set FLIGALIGA_DB_CHECKOUT_TEST=1 explicitly.");
}

if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to run with NODE_ENV=production.");
}

const path = require("path");
const pool = require(path.join(process.cwd(), "db.js"));

const concurrencyLevels = String(process.env.DB_CHECKOUT_CONCURRENCY || "25,50,100")
  .split(",")
  .map(v => Number(v.trim()))
  .filter(Number.isInteger)
  .filter(v => v > 0 && v <= 500);

const holdMs = Math.max(1, Math.min(1000, Number(process.env.DB_CHECKOUT_HOLD_MS) || 25));

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

function msBetween(start) {
  return Number(process.hrtime.bigint() - start) / 1e6;
}

async function oneCheckoutLockScenario(productIds) {
  const client = await pool.connect();
  const start = process.hrtime.bigint();

  try {
    // TEMP table shadows the real cart table for this PostgreSQL session.
    // No application cart rows are created.
    await client.query(
      "CREATE TEMP TABLE cart (user_id integer NOT NULL, product_id integer NOT NULL, quantity integer NOT NULL) ON COMMIT DROP"
    );

    const pidResult = await client.query(
      "SELECT current_backend_pid()::integer AS pid"
    );
    const tempUserId = pidResult.rows[0].pid;

    for (const productId of productIds) {
      await client.query(
        "INSERT INTO cart (user_id, product_id, quantity) VALUES ($1, $2, 1)",
        [tempUserId, productId]
      );
    }

    await client.query("BEGIN");

    // This is the same row-locking SELECT used by production checkout.
    const result = await client.query(
      `SELECT c.product_id, c.quantity, p.price, p.stock, p.name
       FROM cart c
       JOIN products p ON c.product_id = p.id
       WHERE c.user_id = $1
         AND p.is_active = TRUE
         AND p.status = 'active'
       FOR UPDATE OF c, p`,
      [tempUserId]
    );

    // Hold the product row lock to make contention visible.
    await client.query("SELECT pg_sleep($1::double precision)", [holdMs / 1000]);

    await client.query("ROLLBACK");

    if (result.rows.length !== productIds.length) {
      throw new Error(
        `Expected ${productIds.length} locked product rows, got ${result.rows.length}`
      );
    }

    return { ms: msBetween(start), error: null };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    return { ms: msBetween(start), error: err };
  } finally {
    client.release();
  }
}

async function concurrentScenario(productIds, count) {
  const results = await Promise.all(
    Array.from({ length: count }, () => oneCheckoutLockScenario(productIds))
  );

  const times = results.filter(r => !r.error).map(r => r.ms);
  const errors = results.filter(r => r.error);

  return {
    totalMs: results.length ? Math.max(...results.map(r => r.ms)) : 0,
    count,
    errors,
    p50: percentile(times, 50),
    p95: percentile(times, 95),
    p99: percentile(times, 99),
    min: times.length ? Math.min(...times) : 0,
    max: times.length ? Math.max(...times) : 0,
  };
}

function printResult(label, result) {
  console.log(
    label +
    ": requests=" + result.count +
    ", total=" + result.totalMs.toFixed(1) + "ms" +
    ", p50=" + result.p50.toFixed(1) + "ms" +
    ", p95=" + result.p95.toFixed(1) + "ms" +
    ", p99=" + result.p99.toFixed(1) + "ms" +
    ", min=" + result.min.toFixed(1) + "ms" +
    ", max=" + result.max.toFixed(1) + "ms" +
    ", errors=" + result.errors.length
  );

  for (const err of result.errors.slice(0, 5)) {
    console.log("  ERROR:", err.error?.message || err.error);
  }
}

async function runAtomicRollbackTest(productIds) {
  const before = await pool.query(
    "SELECT id, stock FROM products WHERE id = ANY($1::int[]) ORDER BY id",
    [productIds]
  );

  const worker = async productId => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const locked = await client.query(
        "SELECT id, stock FROM products WHERE id = $1 AND is_active = TRUE AND status = 'active' FOR UPDATE",
        [productId]
      );

      if (!locked.rows.length) throw new Error("Product disappeared during lock test");

      const stock = Number(locked.rows[0].stock);
      if (stock > 0) {
        await client.query(
          "UPDATE products SET stock = stock - 1 WHERE id = $1 AND stock >= 1",
          [productId]
        );
      }

      // Simulate checkout failure after reservation. Production would release
      // stock in a rollback/release path. We deliberately rollback here.
      await client.query("ROLLBACK");
      return null;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      return err;
    } finally {
      client.release();
    }
  };

  const errors = [];
  await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      worker(productIds[i % productIds.length]).then(err => {
        if (err) errors.push(err);
      })
    )
  );

  const after = await pool.query(
    "SELECT id, stock FROM products WHERE id = ANY($1::int[]) ORDER BY id",
    [productIds]
  );

  const beforeMap = new Map(before.rows.map(r => [Number(r.id), Number(r.stock)]));
  const afterMap = new Map(after.rows.map(r => [Number(r.id), Number(r.stock)]));

  const unchanged = productIds.every(
    id => beforeMap.get(Number(id)) === afterMap.get(Number(id))
  );

  return { unchanged, errors, before: before.rows, after: after.rows };
}

async function main() {
  console.log("FLIGALIGA real-PostgreSQL checkout/concurrency test");
  console.log("---------------------------------------------------");
  console.log("Safety mode: TEST ONLY — transactions are rolled back");
  console.log("Lock hold per checkout simulation:", holdMs + "ms");

  const info = await pool.query(`
    SELECT
      current_database() AS database_name,
      current_user AS database_user,
      current_setting('max_connections') AS max_connections
  `);
  console.log("Database:", info.rows[0].database_name);
  console.log("DB user:", info.rows[0].database_user);
  console.log("Postgres max_connections:", info.rows[0].max_connections);

  const schemaCheck = await pool.query(`
    SELECT
      to_regclass('public.products') AS products_table,
      to_regclass('public.cart') AS cart_table,
      to_regclass('public.orders') AS orders_table,
      to_regclass('public.order_items') AS order_items_table
  `);

  const schema = schemaCheck.rows[0];
  console.log(
    "Required tables:",
    "products=" + Boolean(schema.products_table),
    "cart=" + Boolean(schema.cart_table),
    "orders=" + Boolean(schema.orders_table),
    "order_items=" + Boolean(schema.order_items_table)
  );

  if (!schema.products_table || !schema.cart_table || !schema.orders_table || !schema.order_items_table) {
    throw new Error("Required checkout tables are missing.");
  }

  const productQuery = await pool.query(`
    SELECT id, name, stock, price
    FROM products
    WHERE is_active = TRUE
      AND status = 'active'
      AND stock >= 1
    ORDER BY id
    LIMIT 2
  `);

  if (productQuery.rows.length < 1) {
    throw new Error("Need at least one active product with stock >= 1.");
  }

  const productIds = productQuery.rows.map(row => Number(row.id));
  console.log(
    "Test product(s):",
    productQuery.rows.map(row =>
      `#${row.id} "${row.name}" stock=${row.stock} price=${row.price}`
    ).join(" | ")
  );

  console.log("");
  console.log("1) Exact checkout FOR UPDATE contention on one product");
  const oneProduct = [productIds[0]];

  for (const concurrency of concurrencyLevels) {
    const result = await concurrentScenario(oneProduct, concurrency);
    printResult("  Concurrency " + concurrency, result);
  }

  if (productIds.length >= 2) {
    console.log("");
    console.log("2) Exact checkout FOR UPDATE contention on two products");
    for (const concurrency of concurrencyLevels.slice(0, 2)) {
      const result = await concurrentScenario(productIds.slice(0, 2), concurrency);
      printResult("  Concurrency " + concurrency, result);
    }
  } else {
    console.log("");
    console.log("2) Two-product contention: SKIPPED (only one in-stock product available)");
  }

  console.log("");
  console.log("3) Stock reservation rollback integrity");
  const rollback = await runAtomicRollbackTest(productIds);
  console.log("  Errors:", rollback.errors.length);
  console.log("  Product stock unchanged after all rollbacks:", rollback.unchanged ? "YES" : "NO");
  console.log("  Before:", JSON.stringify(rollback.before));
  console.log("  After :", JSON.stringify(rollback.after));

  if (rollback.errors.length) {
    for (const err of rollback.errors.slice(0, 5)) {
      console.log("  ERROR:", err.message);
    }
  }

  console.log("");
  console.log("4) What this means");
  console.log(
    "  - High same-product latency is expected: inventory locking deliberately serializes buyers of the same SKU."
  );
  console.log(
    "  - Errors/deadlocks are not expected from the tested checkout lock path."
  );
  console.log(
    "  - Stock must be identical before/after because every simulated failure is rolled back."
  );

  if (rollback.unchanged && rollback.errors.length === 0) {
    console.log("");
    console.log("DONE — checkout concurrency test completed; no application data was committed.");
  } else {
    throw new Error("Checkout rollback integrity failed.");
  }
}

main()
  .catch(err => {
    console.error("CHECKOUT LOAD TEST FAILED:", err.stack || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
