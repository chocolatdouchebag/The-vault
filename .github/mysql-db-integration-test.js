"use strict";

const assert = require("node:assert/strict");
const pool = require("../db");
const MySqlSessionStore = require("../session-store");
const { releaseReservedStock } = require("../payment-cleanup");

function callbackPromise(register) {
  return new Promise((resolve, reject) => {
    register((error, value) => error ? reject(error) : resolve(value));
  });
}

async function main() {
  const sessionStore = new MySqlSessionStore(pool);
  let userId = null;
  let productId = null;
  let orderId = null;
  const sessionId = "mysql-adapter-integration-test-session";

  try {
    const timezone = await pool.query("SELECT @@session.time_zone AS time_zone");
    assert.equal(timezone.rows[0]?.time_zone, "+00:00", "application DB session should use UTC");

    const intervalQuery = await pool.query(
      "SELECT CURRENT_TIMESTAMP + make_interval(mins => $1::integer) AS future_time",
      [10]
    );
    assert.ok(new Date(intervalQuery.rows[0]?.future_time).getTime() > Date.now(), "PostgreSQL interval arithmetic should translate to MySQL");

    const userInsert = await pool.query(
      "INSERT INTO users (username, password, is_admin) VALUES ($1, $2, $3) RETURNING id",
      ["mysql-adapter-integration-user", "not-a-real-password-hash", false]
    );
    assert.equal(userInsert.rows.length, 1);
    userId = userInsert.rows[0].id;
    assert.ok(Number(userId) > 0);

    await assert.rejects(
      pool.query(
        "INSERT INTO users (username, password) VALUES ($1, $2)",
        ["mysql-adapter-integration-user", "duplicate"]
      ),
      error => error && error.code === "23505",
      "duplicate key errors should map to the existing PostgreSQL-compatible code"
    );

    const category = await pool.query("SELECT id FROM categories WHERE slug = $1", ["test-category"]);
    assert.equal(category.rows.length, 1, "schema workflow should have seeded test-category");

    const productInsert = await pool.query(
      "INSERT INTO products (name, price, stock, image_url, category_id) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      ["mysql-adapter-integration-product", "19.99", 4, null, category.rows[0].id]
    );
    productId = productInsert.rows[0]?.id;
    assert.ok(Number(productId) > 0);

    const selected = await pool.query(
      "SELECT id, name, price, stock FROM products WHERE id = $1",
      [productId]
    );
    assert.equal(selected.rows[0]?.name, "mysql-adapter-integration-product");
    assert.equal(Number(selected.rows[0]?.price), 19.99);

    const updated = await pool.query(
      "UPDATE products SET description = $1 WHERE id = $2 RETURNING *",
      ["Verified through the MySQL compatibility adapter", productId]
    );
    assert.equal(updated.rows.length, 1, "UPDATE ... RETURNING * should return the updated row");
    assert.equal(updated.rows[0].description, "Verified through the MySQL compatibility adapter");
    assert.equal(typeof updated.rows[0].is_active, "boolean", "boolean columns should preserve PostgreSQL response types");
    assert.equal(updated.rows[0].is_active, true);
    assert.equal(updated.rows[0].is_featured, false);
    assert.equal(Object.hasOwn(updated.rows[0], "unique_name_image_hash"), false);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query(
        "SELECT id FROM products WHERE id = $1 FOR UPDATE OF products",
        [productId]
      );
      assert.equal(locked.rows[0]?.id, productId, "FOR UPDATE OF should be translated for InnoDB");
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }

    // Exercise the same transaction and stock-restoration path used when a payment expires/fails.
    const orderInsert = await pool.query(
      "INSERT INTO orders (user_id, total, status, payment_expires_at) " +
      "VALUES ($1, $2, 'payment_pending', DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 30 MINUTE)) RETURNING id",
      [userId, "39.98"]
    );
    orderId = orderInsert.rows[0]?.id;
    assert.ok(Number(orderId) > 0);

    await pool.query(
      "INSERT INTO order_items (order_id, product_id, quantity, price, price_each) VALUES ($1, $2, $3, $4, $5)",
      [orderId, productId, 2, "39.98", "19.99"]
    );
    await pool.query("UPDATE products SET stock = stock - $1 WHERE id = $2", [2, productId]);

    const beforeRelease = await pool.query("SELECT stock FROM products WHERE id = $1", [productId]);
    assert.equal(Number(beforeRelease.rows[0].stock), 2, "fixture simulates stock already reserved by checkout");

    const release = await releaseReservedStock(pool, orderId, "payment_failed");
    assert.deepEqual(release, { released: true, reason: "released" });
    const afterRelease = await pool.query("SELECT stock FROM products WHERE id = $1", [productId]);
    assert.equal(Number(afterRelease.rows[0].stock), 4, "failed payment should restore reserved stock");

    const duplicateRelease = await releaseReservedStock(pool, orderId, "payment_failed");
    assert.deepEqual(duplicateRelease, { released: false, reason: "already_final" });
    const afterDuplicate = await pool.query("SELECT stock FROM products WHERE id = $1", [productId]);
    assert.equal(Number(afterDuplicate.rows[0].stock), 4, "retry must not restore the same stock twice");

    const session = {
      cookie: { expires: new Date(Date.now() + 600000).toISOString() },
      userId
    };
    await callbackPromise(callback => sessionStore.set(sessionId, session, callback));
    const readSession = await callbackPromise(callback => sessionStore.get(sessionId, callback));
    assert.equal(readSession?.userId, userId, "MySQL JSON session storage should round-trip session data");

    await callbackPromise(callback => sessionStore.touch(sessionId, session, callback));
    await callbackPromise(callback => sessionStore.destroy(sessionId, callback));

    console.log("MySQL application adapter integration checks passed.");
  } finally {
    await callbackPromise(callback => sessionStore.destroy(sessionId, callback)).catch(() => {});
    if (orderId !== null) {
      await pool.query("DELETE FROM order_items WHERE order_id = $1", [orderId]).catch(() => {});
      await pool.query("DELETE FROM orders WHERE id = $1", [orderId]).catch(() => {});
    }
    if (productId !== null) {
      await pool.query("DELETE FROM products WHERE id = $1", [productId]).catch(() => {});
    }
    if (userId !== null) {
      await pool.query("DELETE FROM users WHERE id = $1", [userId]).catch(() => {});
    }
    await pool.end();
  }
}

main().catch(error => {
  console.error("MySQL application adapter integration check failed:", error.message || "unknown error");
  process.exitCode = 1;
});
