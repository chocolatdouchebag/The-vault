#!/usr/bin/env node
"use strict";

/*
 * FLIGALIGA real-PostgreSQL payment lifecycle test.
 *
 * Safety:
 * - Requires FLIGALIGA_DB_PAYMENT_TEST=1.
 * - Refuses NODE_ENV=production.
 * - Uses dedicated temporary test product/user/order rows.
 * - Deletes all test rows in cleanup.
 *
 * Run from repository root:
 *   FLIGALIGA_DB_PAYMENT_TEST=1 node .github/local-db-payment-lifecycle-test.js
 */

if (process.env.FLIGALIGA_DB_PAYMENT_TEST !== "1") {
  throw new Error("Refusing to run. Set FLIGALIGA_DB_PAYMENT_TEST=1 explicitly.");
}

if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to run with NODE_ENV=production.");
}

const path = require("path");
const fs = require("fs");
const pool = require(path.join(process.cwd(), "db.js"));

async function createFixtures() {
  const client = await pool.connect();
  const stamp = Date.now();

  try {
    await client.query("BEGIN");

    const user = await client.query(
      `INSERT INTO users (username, password)
       VALUES ($1, $2)
       RETURNING id`,
      ["__FLIGALIGA_PAYMENT_TEST_USER__" + stamp, "not-a-real-password"]
    );

    const product = await client.query(
      `INSERT INTO products
        (name, description, price, stock, image_url, category, rarity, origin, condition, provenance,
         is_featured, is_new_arrival, is_active, status)
       VALUES ($1, $2, 10.00, 5, $3, 'Artifacts', 'Common', 'TEST', 'TEST', 'TEST', FALSE, FALSE, FALSE, 'active')
       RETURNING id, stock`,
      [
        "__FLIGALIGA_PAYMENT_TEST_PRODUCT__" + stamp,
        "Temporary payment lifecycle test product.",
        "__fligaliga_payment_test__" + stamp
      ]
    );

    await client.query("COMMIT");

    return {
      userId: Number(user.rows[0].id),
      productId: Number(product.rows[0].id),
      startingStock: Number(product.rows[0].stock)
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function cleanupFixtures(userId, productId, orderIds) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (orderIds.length) {
      await client.query("DELETE FROM order_items WHERE order_id = ANY($1::int[])", [orderIds]);
      await client.query("DELETE FROM orders WHERE id = ANY($1::int[])", [orderIds]);
    }
    await client.query("DELETE FROM cart WHERE user_id = $1", [userId]).catch(() => {});
    await client.query("DELETE FROM products WHERE id = $1", [productId]);
    await client.query("DELETE FROM users WHERE id = $1", [userId]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/*
 * This is intentionally the same database logic as server.js's
 * releaseReservedStock(orderId, status), kept here as a deterministic
 * integration test against the real schema.
 */
async function releaseReservedStockForTest(orderId, status) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const order = await client.query(
      "SELECT status, stock_released_at FROM orders WHERE id = $1 FOR UPDATE",
      [orderId]
    );

    if (!order.rows.length) {
      await client.query("ROLLBACK");
      return;
    }

    if (order.rows[0].stock_released_at || order.rows[0].status === "paid") {
      await client.query("COMMIT");
      return;
    }

    const items = await client.query(
      "SELECT product_id, quantity FROM order_items WHERE order_id = $1",
      [orderId]
    );

    for (const item of items.rows) {
      await client.query(
        "UPDATE products SET stock = stock + $1 WHERE id = $2",
        [item.quantity, item.product_id]
      );
    }

    await client.query(
      "UPDATE orders SET status = $1, stock_released_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [status, orderId]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function createReservedOrder(userId, productId, quantity, status = "payment_pending") {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const lock = await client.query(
      "SELECT stock FROM products WHERE id = $1 FOR UPDATE",
      [productId]
    );
    if (!lock.rows.length || Number(lock.rows[0].stock) < quantity) {
      throw new Error("Insufficient test stock");
    }

    await client.query(
      "UPDATE products SET stock = stock - $1 WHERE id = $2",
      [quantity, productId]
    );

    const order = await client.query(
      `INSERT INTO orders
        (user_id, total, status, customer_name, customer_email,
         shipping_address_line1, shipping_postcode, shipping_city, shipping_country)
       VALUES ($1, $2, $3, 'Payment Test', 'payment-test@example.invalid',
               'Test Street 1', '0000AA', 'Test City', 'NL')
       RETURNING id, status, stock_released_at`,
      [userId, quantity * 10, status]
    );

    await client.query(
      "INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, 10.00)",
      [order.rows[0].id, productId, quantity]
    );

    await client.query("COMMIT");
    return Number(order.rows[0].id);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function getProductStock(productId) {
  const result = await pool.query(
    "SELECT stock FROM products WHERE id = $1",
    [productId]
  );
  return result.rows.length ? Number(result.rows[0].stock) : null;
}

async function getOrder(orderId) {
  const result = await pool.query(
    "SELECT id, status, stock_released_at, updated_at FROM orders WHERE id = $1",
    [orderId]
  );
  return result.rows[0] || null;
}

async function main() {
  console.log("FLIGALIGA real-PostgreSQL payment lifecycle test");
  console.log("------------------------------------------------");
  console.log("Safety mode: dedicated test rows only");

  const fixtures = await createFixtures();
  const orderIds = [];

  console.log(
    "Test product:",
    "#" + fixtures.productId,
    "starting stock=" + fixtures.startingStock
  );

  try {
    console.log("");
    console.log("1) Payment failure releases exactly the reserved stock");
    const failedOrderId = await createReservedOrder(fixtures.userId, fixtures.productId, 1);
    orderIds.push(failedOrderId);

    const reservedStock = await getProductStock(fixtures.productId);
    console.log("  Stock after reservation:", reservedStock);

    await releaseReservedStockForTest(failedOrderId, "payment_failed");

    const releasedStock = await getProductStock(fixtures.productId);
    const releasedOrder = await getOrder(failedOrderId);

    console.log("  Stock after release:", releasedStock);
    console.log("  Order status:", releasedOrder.status);
    console.log("  stock_released_at set:", Boolean(releasedOrder.stock_released_at));

    if (
      releasedStock !== fixtures.startingStock ||
      releasedOrder.status !== "payment_failed" ||
      !releasedOrder.stock_released_at
    ) {
      throw new Error("Payment-failure stock release failed.");
    }

    console.log("");
    console.log("2) Repeated failure webhook cannot release stock twice");
    await releaseReservedStockForTest(failedOrderId, "payment_failed");

    const repeatedStock = await getProductStock(fixtures.productId);
    const repeatedOrder = await getOrder(failedOrderId);

    console.log("  Stock after second release attempt:", repeatedStock);
    console.log("  Order status remains:", repeatedOrder.status);

    if (repeatedStock !== fixtures.startingStock || repeatedOrder.status !== "payment_failed") {
      throw new Error("Repeated release changed stock or order state.");
    }

    console.log("");
    console.log("3) Paid order cannot have its reservation released");
    const paidOrderId = await createReservedOrder(fixtures.userId, fixtures.productId, 1, "paid");
    orderIds.push(paidOrderId);

    const paidReservedStock = await getProductStock(fixtures.productId);
    await releaseReservedStockForTest(paidOrderId, "payment_failed");

    const paidAfterStock = await getProductStock(fixtures.productId);
    const paidAfter = await getOrder(paidOrderId);

    console.log("  Stock after paid-order release attempt:", paidAfterStock);
    console.log("  Paid order status:", paidAfter.status);
    console.log("  Paid order stock_released_at:", paidAfter.stock_released_at);

    if (
      paidAfterStock !== paidReservedStock ||
      paidAfter.status !== "paid" ||
      paidAfter.stock_released_at
    ) {
      throw new Error("Paid-order release guard failed.");
    }

    console.log("");
    console.log("4) Canceled and expired statuses both restore their own reservation");
    const canceledOrderId = await createReservedOrder(fixtures.userId, fixtures.productId, 1);
    orderIds.push(canceledOrderId);
    const beforeCanceledRelease = await getProductStock(fixtures.productId);
    await releaseReservedStockForTest(canceledOrderId, "canceled");

    const afterCanceled = await getProductStock(fixtures.productId);
    console.log("  Stock before canceled release:", beforeCanceledRelease);
    console.log("  Stock after canceled release:", afterCanceled);
    if (afterCanceled !== beforeCanceledRelease + 1) {
      throw new Error("Canceled payment did not restore its reserved stock.");
    }

    const expiredOrderId = await createReservedOrder(fixtures.userId, fixtures.productId, 1);
    orderIds.push(expiredOrderId);
    const beforeExpiredRelease = await getProductStock(fixtures.productId);
    await releaseReservedStockForTest(expiredOrderId, "expired");

    const afterExpired = await getProductStock(fixtures.productId);
    console.log("  Stock before expired release:", beforeExpiredRelease);
    console.log("  Stock after expired release:", afterExpired);
    if (afterExpired !== beforeExpiredRelease + 1) {
      throw new Error("Expired payment did not restore its reserved stock.");
    }

    console.log("  Canceled release: PASS");
    console.log("  Expired release: PASS");

    console.log("");
    console.log("5) Check whether the application has an automatic pending-order expiry path");

    const serverSource = fs.readFileSync(path.join(process.cwd(), "server.js"), "utf8");
    // Inspect each timer callback independently so the unrelated session
    // cleanup timer cannot be mistaken for payment expiry logic.
    const hasScheduledExpiry = [...serverSource.matchAll(/set(?:Interval|Timeout)\\s*\\(/g)]
      .some(match => {
        const callback = serverSource.slice(match.index, match.index + 5000);
        return callback.includes("payment_pending") && callback.includes("releaseReservedStock");
      });

    console.log("  Automatic pending-order expiry logic detected:", hasScheduledExpiry ? "YES" : "NO");

    if (hasScheduledExpiry) {
      console.log("  Result: a timer-based pending-order expiry path was detected in server.js.");
    } else {
      console.log("  Result: NO timer-based pending-order expiry path was detected in server.js.");
      console.log("  NOTE: the existing setInterval for session cleanup is unrelated to payment expiry.");
      console.log("        An abandoned payment_pending order can therefore retain its stock reservation");
      console.log("        until Mollie reports a terminal status or an explicit cleanup job is added.");
    }

    console.log("");
    console.log("PASS: payment-failure/cancel/expiry release behavior is idempotent.");
    if (!hasScheduledExpiry) {
      console.log("FINDING: abandoned payment_pending reservations have no automatic expiry.");
    }
  } finally {
    await cleanupFixtures(fixtures.userId, fixtures.productId, orderIds);
    console.log("Cleanup: payment test rows deleted.");
  }

  console.log("DONE — no permanent test data remains.");
}

main()
  .catch(err => {
    console.error("PAYMENT LIFECYCLE TEST FAILED:", err.stack || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
