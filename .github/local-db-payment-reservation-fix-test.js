#!/usr/bin/env node
"use strict";

/*
 * FLIGALIGA payment-reservation-fix integration test.
 *
 * Requires: FLIGALIGA_DB_PAYMENT_FIX_TEST=1
 * Refuses NODE_ENV=production.
 * Mollie HTTP calls are mocked; no real Mollie API requests occur.
 * Test rows are deleted afterward.
 *
 * Apply migrations/007_payment_reservation_expiry.sql first.
 */

if (process.env.FLIGALIGA_DB_PAYMENT_FIX_TEST !== "1") {
  throw new Error("Refusing to run. Set FLIGALIGA_DB_PAYMENT_FIX_TEST=1 explicitly.");
}

if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to run with NODE_ENV=production.");
}

const path = require("path");
const pool = require(path.join(process.cwd(), "db.js"));
const { cleanupExpiredPaymentReservations } = require(
  path.join(process.cwd(), "payment-cleanup.js")
);

async function createFixtures() {
  const client = await pool.connect();
  const stamp = Date.now();

  try {
    await client.query("BEGIN");
    const column = await client.query(
      "SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3",
      ["public", "orders", "payment_expires_at"]
    );
    if (!column.rows.length) {
      throw new Error("orders.payment_expires_at is missing. Apply migrations/007_payment_reservation_expiry.sql first.");
    }

    const user = await client.query(
      "INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id",
      ["__FLIGALIGA_PAYMENT_FIX_USER__" + stamp, "test"]
    );

    const product = await client.query(
      "INSERT INTO products " +
      "(name, description, price, stock, image_url, category, rarity, origin, condition, provenance, is_featured, is_new_arrival, is_active, status) " +
      "VALUES ($1, $2, 10.00, 10, $3, 'Artifacts', 'Common', 'TEST', 'TEST', 'TEST', FALSE, FALSE, FALSE, 'active') RETURNING id",
      ["__FLIGALIGA_PAYMENT_FIX_PRODUCT__" + stamp, "Temporary payment cleanup product", "__fligaliga_payment_fix__" + stamp]
    );

    await client.query("COMMIT");
    return { userId: Number(user.rows[0].id), productId: Number(product.rows[0].id) };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function createReservedOrder(userId, productId, paymentId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const product = await client.query("SELECT stock FROM products WHERE id = $1 FOR UPDATE", [productId]);
    if (!product.rows.length || Number(product.rows[0].stock) < 1) throw new Error("Insufficient test stock");
    await client.query("UPDATE products SET stock = stock - 1 WHERE id = $1", [productId]);

    const order = await client.query(
      "INSERT INTO orders " +
      "(user_id, total, status, customer_name, customer_email, shipping_address_line1, shipping_postcode, shipping_city, shipping_country, payment_id, payment_expires_at) " +
      "VALUES ($1, 10.00, 'payment_pending', 'Payment Fix Test', 'payment-fix@example.invalid', 'Test Street 1', '0000AA', 'Test City', 'NL', $2, CURRENT_TIMESTAMP - INTERVAL '1 minute') RETURNING id",
      [userId, paymentId]
    );
    await client.query("INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, 1, 10.00)", [order.rows[0].id, productId]);
    await client.query("COMMIT");
    return Number(order.rows[0].id);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function getState(orderId, productId) {
  const result = await pool.query(
    "SELECT o.status, o.stock_released_at, p.stock " +
    "FROM orders o JOIN order_items oi ON oi.order_id = o.id " +
    "JOIN products p ON p.id = oi.product_id " +
    "WHERE o.id = $1 AND p.id = $2",
    [orderId, productId]
  );
  return result.rows[0] || null;
}

async function cleanupFixtures(userId, productId, orderIds) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (orderIds.length) {
      await client.query("DELETE FROM order_items WHERE order_id = ANY($1::int[])", [orderIds]);
      await client.query("DELETE FROM orders WHERE id = ANY($1::int[])", [orderIds]);
    }
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

function payment(id, status, isCancelable) {
  return { id, status, isCancelable: !!isCancelable, amount: { currency: "EUR", value: "10.00" } };
}

function mockFetch(getPayment, cancelPayment, beforeCancel) {
  return async (url, options = {}) => {
    const method = options.method || "GET";
    if (method === "GET") return { ok: true, status: 200, json: async () => getPayment() };
    if (method === "DELETE") {
      if (beforeCancel) await beforeCancel();
      return { ok: true, status: 200, json: async () => cancelPayment() };
    }
    throw new Error("Unexpected mock HTTP method: " + method);
  };
}

async function main() {
  console.log("FLIGALIGA payment reservation fix integration test");
  console.log("-------------------------------------------------");
  console.log("Safety mode: dedicated DB rows; Mollie HTTP is mocked");

  const fixtures = await createFixtures();
  const orderIds = [];

  try {
    console.log("Test product: #" + fixtures.productId);

    console.log("");
    console.log("1) Expired open + cancelable payment is canceled and stock released");
    const cancelId = "tr_test_cancelable_" + fixtures.productId;
    const cancelOrder = await createReservedOrder(fixtures.userId, fixtures.productId, cancelId);
    orderIds.push(cancelOrder);
    await cleanupExpiredPaymentReservations({
      pool,
      apiKey: "test-key",
      fetchImpl: mockFetch(
        () => payment(cancelId, "open", true),
        () => payment(cancelId, "canceled", false)
      )
    });
    const canceled = await getState(cancelOrder, fixtures.productId);
    console.log("  Status:", canceled.status, "Stock:", canceled.stock, "Released:", Boolean(canceled.stock_released_at));
    if (canceled.status !== "payment_expired" || canceled.stock !== 10 || !canceled.stock_released_at) {
      throw new Error("Cancelable expired payment was not cleaned up correctly.");
    }

    console.log("");
    console.log("2) Expired payment already paid at Mollie is marked paid, not released");
    const paidId = "tr_test_paid_" + fixtures.productId;
    const paidOrder = await createReservedOrder(fixtures.userId, fixtures.productId, paidId);
    orderIds.push(paidOrder);
    await cleanupExpiredPaymentReservations({
      pool,
      apiKey: "test-key",
      fetchImpl: mockFetch(() => payment(paidId, "paid", false), () => payment(paidId, "paid", false))
    });
    const paid = await getState(paidOrder, fixtures.productId);
    console.log("  Status:", paid.status, "Stock:", paid.stock, "Released:", Boolean(paid.stock_released_at));
    if (paid.status !== "paid" || paid.stock !== 9 || paid.stock_released_at) {
      throw new Error("Paid stale payment was incorrectly released.");
    }

    console.log("");
    console.log("3) Race protection: order becomes paid before cleanup releases stock");
    const raceId = "tr_test_race_" + fixtures.productId;
    const raceOrder = await createReservedOrder(fixtures.userId, fixtures.productId, raceId);
    orderIds.push(raceOrder);
    await cleanupExpiredPaymentReservations({
      pool,
      apiKey: "test-key",
      fetchImpl: mockFetch(
        () => payment(raceId, "open", true),
        () => payment(raceId, "canceled", false),
        async () => {
          await pool.query("UPDATE orders SET status = 'paid', paid_at = CURRENT_TIMESTAMP WHERE id = $1", [raceOrder]);
        }
      )
    });
    const race = await getState(raceOrder, fixtures.productId);
    console.log("  Status:", race.status, "Stock:", race.stock, "Released:", Boolean(race.stock_released_at));
    if (race.status !== "paid" || race.stock !== 8 || race.stock_released_at) {
      throw new Error("Cleanup race released stock from a now-paid order.");
    }

    console.log("");
    console.log("4) Expired non-cancelable open payment is left alone");
    const openId = "tr_test_open_" + fixtures.productId;
    const openOrder = await createReservedOrder(fixtures.userId, fixtures.productId, openId);
    orderIds.push(openOrder);
    await cleanupExpiredPaymentReservations({
      pool,
      apiKey: "test-key",
      fetchImpl: mockFetch(() => payment(openId, "open", false), () => payment(openId, "open", false))
    });
    const open = await getState(openOrder, fixtures.productId);
    console.log("  Status:", open.status, "Stock:", open.stock, "Released:", Boolean(open.stock_released_at));
    if (open.status !== "payment_pending" || open.stock !== 7 || open.stock_released_at) {
      throw new Error("Non-cancelable payment was released unsafely.");
    }

    console.log("");
    console.log("PASS: safely cancelable abandoned reservations are released.");
    console.log("PASS: successful payments are reconciled before release.");
    console.log("PASS: a paid-state race cannot release inventory.");
    console.log("PASS: non-cancelable payments remain protected.");
  } finally {
    await cleanupFixtures(fixtures.userId, fixtures.productId, orderIds);
    console.log("Cleanup: test rows deleted.");
  }

  console.log("DONE — no permanent test data remains.");
}

main()
  .catch(err => {
    console.error("PAYMENT RESERVATION FIX TEST FAILED:", err.stack || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
