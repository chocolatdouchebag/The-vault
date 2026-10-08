#!/usr/bin/env node
"use strict";

/*
 * FLIGALIGA real-PostgreSQL correctness tests.
 *
 * Safety:
 * - Requires FLIGALIGA_DB_CORRECTNESS_TEST=1.
 * - Refuses NODE_ENV=production.
 * - Creates only two clearly-marked inactive test products.
 * - Stock race writes only those test rows, then deletes them.
 * - Deadlock test locks only those test rows and rolls back.
 *
 * Run from repository root:
 *   FLIGALIGA_DB_CORRECTNESS_TEST=1 node .github/local-db-correctness-test.js
 *
 * Optional:
 *   DB_CORRECTNESS_CONCURRENCY=100
 */

if (process.env.FLIGALIGA_DB_CORRECTNESS_TEST !== "1") {
  throw new Error("Refusing to run. Set FLIGALIGA_DB_CORRECTNESS_TEST=1 explicitly.");
}

if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to run with NODE_ENV=production.");
}

const path = require("path");
const pool = require(path.join(process.cwd(), "db.js"));

const concurrency = Math.max(
  10,
  Math.min(200, Number(process.env.DB_CORRECTNESS_CONCURRENCY) || 100)
);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createTestProducts() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const stamp = Date.now();
    const names = [
      "__FLIGALIGA_DB_TEST_STOCK__" + stamp,
      "__FLIGALIGA_DB_TEST_DEADLOCK__" + stamp
    ];

    const rows = [];
    for (const name of names) {
      const result = await client.query(
        `INSERT INTO products
          (name, description, price, stock, image_url, category, rarity, origin, condition, provenance, is_featured, is_new_arrival, is_active, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, FALSE, FALSE, FALSE, 'active')
         RETURNING id, name, stock`,
        [
          name,
          "Temporary database correctness test product. DELETE after test.",
          1.00,
          name.includes("STOCK") ? 4 : 1,
          "__fligaliga_db_test__" + stamp,
          "Artifacts",
          "Common",
          "TEST",
          "TEST",
          "TEST"
        ]
      );
      rows.push(result.rows[0]);
    }

    await client.query("COMMIT");
    return rows;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function cleanupTestProducts(ids) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM products WHERE id = ANY($1::int[])", [ids]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function stockRaceTest(productId, startingStock) {
  const results = await Promise.all(
    Array.from({ length: concurrency }, async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // Matches the production checkout's essential locking pattern:
        // obtain the product row lock before deciding whether stock exists.
        const locked = await client.query(
          "SELECT id, stock FROM products WHERE id = $1 FOR UPDATE",
          [productId]
        );

        if (!locked.rows.length) throw new Error("Test product disappeared");

        if (Number(locked.rows[0].stock) < 1) {
          await client.query("ROLLBACK");
          return { success: false, error: null };
        }

        const updated = await client.query(
          "UPDATE products SET stock = stock - 1 WHERE id = $1 AND stock >= 1 RETURNING stock",
          [productId]
        );

        if (updated.rowCount !== 1) {
          await client.query("ROLLBACK");
          return { success: false, error: new Error("Atomic stock update affected 0 rows") };
        }

        await client.query("COMMIT");
        return { success: true, error: null };
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        return { success: false, error: err };
      } finally {
        client.release();
      }
    })
  );

  const after = await pool.query(
    "SELECT stock FROM products WHERE id = $1",
    [productId]
  );

  if (!after.rows.length) throw new Error("Test product missing after stock race");

  const successes = results.filter(r => r.success).length;
  const errors = results.filter(r => r.error);

  return {
    successes,
    errors,
    finalStock: Number(after.rows[0].stock),
    expectedSuccesses: startingStock,
    expectedFinalStock: 0
  };
}

async function deadlockTest(firstId, secondId) {
  const a = await pool.connect();
  const b = await pool.connect();

  try {
    await Promise.all([a.query("BEGIN"), b.query("BEGIN")]);

    await a.query(
      "SELECT id FROM products WHERE id = $1 FOR UPDATE",
      [firstId]
    );
    await b.query(
      "SELECT id FROM products WHERE id = $1 FOR UPDATE",
      [secondId]
    );

    // Deliberately request the opposite lock order. PostgreSQL should detect
    // a deadlock and abort exactly one transaction with SQLSTATE 40P01.
    const [aResult, bResult] = await Promise.all([
      a.query("SELECT id FROM products WHERE id = $1 FOR UPDATE", [secondId])
        .then(() => ({ ok: true, error: null }))
        .catch(error => ({ ok: false, error })),
      b.query("SELECT id FROM products WHERE id = $1 FOR UPDATE", [firstId])
        .then(() => ({ ok: true, error: null }))
        .catch(error => ({ ok: false, error }))
    ]);

    await a.query("ROLLBACK").catch(() => {});
    await b.query("ROLLBACK").catch(() => {});

    const results = [aResult, bResult];
    const deadlocks = results.filter(r => r.error?.code === "40P01");
    const otherErrors = results.filter(
      r => r.error && r.error.code !== "40P01"
    );

    return {
      deadlocks: deadlocks.length,
      otherErrors,
      successfulTransactions: results.filter(r => r.ok).length
    };
  } finally {
    a.release();
    b.release();
  }
}

async function main() {
  console.log("FLIGALIGA real-PostgreSQL correctness tests");
  console.log("-------------------------------------------");
  console.log("Concurrency:", concurrency);
  console.log("Safety mode: dedicated inactive test products only");

  let testProducts = [];

  try {
    testProducts = await createTestProducts();
    const stockProductId = Number(testProducts[0].id);
    const deadlockProductId = Number(testProducts[1].id);

    console.log(
      "Created test products:",
      testProducts.map(p => "#" + p.id + " " + p.name + " stock=" + p.stock).join(" | ")
    );

    console.log("");
    console.log("1) Overselling race");
    const stockResult = await stockRaceTest(stockProductId, 4);
    console.log("  Successful purchases:", stockResult.successes);
    console.log("  Expected successful purchases:", stockResult.expectedSuccesses);
    console.log("  Final stock:", stockResult.finalStock);
    console.log("  Expected final stock:", stockResult.expectedFinalStock);
    console.log("  Errors:", stockResult.errors.length);

    if (
      stockResult.successes !== stockResult.expectedSuccesses ||
      stockResult.finalStock !== stockResult.expectedFinalStock ||
      stockResult.errors.length
    ) {
      throw new Error("Overselling race integrity check failed.");
    }

    // We need a second test row for deadlock. Reset its stock isn't necessary;
    // only the row lock matters, and both test products are deleted afterward.
    console.log("");
    console.log("2) Opposite lock-order deadlock detection");
    const deadlockResult = await deadlockTest(stockProductId, deadlockProductId);
    console.log("  Deadlocks detected:", deadlockResult.deadlocks);
    console.log("  Successful transaction after detection:", deadlockResult.successfulTransactions);
    console.log("  Other errors:", deadlockResult.otherErrors.length);

    if (deadlockResult.deadlocks !== 1 || deadlockResult.otherErrors.length) {
      throw new Error("Expected exactly one PostgreSQL deadlock detection (SQLSTATE 40P01).");
    }

    console.log("");
    console.log("PASS: stock cannot oversell in the tested FOR UPDATE path.");
    console.log("PASS: PostgreSQL detects an intentionally-created opposite lock order.");
  } finally {
    if (testProducts.length) {
      await cleanupTestProducts(testProducts.map(p => Number(p.id)));
      console.log("Cleanup: test products deleted.");
    }
  }

  console.log("");
  console.log("DONE — no permanent test data remains.");
}

main()
  .catch(err => {
    console.error("CORRECTNESS TEST FAILED:", err.stack || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
