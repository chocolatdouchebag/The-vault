"use strict";

const assert = require("node:assert/strict");
const mysql = require("mysql2/promise");

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Math.max(1, Math.min(65535, Number(process.env.MYSQL_PORT) || 3306)),
    database: process.env.MYSQL_DATABASE,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD || "",
    connectTimeout: 10000,
    charset: "utf8mb4",
    timezone: "Z",
    ssl: process.env.MYSQL_SSL === "true"
      ? { rejectUnauthorized: process.env.MYSQL_SSL_REJECT_UNAUTHORIZED !== "false" }
      : undefined
  });

  try {
    const keys = [
      ["users", "id", 41],
      ["categories", "id", 43],
      ["products", "id", 44],
      ["product_variants", "id", 45],
      ["product_images", "id", 46],
      ["orders", "id", 47],
      ["cart", "id", 48],
      ["order_items", "id", 49],
      ["session", "sid", "transfer-fixture-session"],
      ["withdrawal_requests", "id", 50]
    ];

    for (const [table, key, expected] of keys) {
      const [counts] = await connection.query("SELECT COUNT(*) AS row_count FROM `" + table + "`");
      assert.equal(Number(counts[0].row_count), 1, table + " should have exactly one transferred fixture row");

      const [rows] = await connection.query(
        "SELECT `" + key + "` AS transfer_key FROM `" + table + "`"
      );
      assert.equal(String(rows[0]?.transfer_key), String(expected), table + " primary key should be preserved");
    }

    const [products] = await connection.query(
      "SELECT name, CAST(price AS CHAR) AS price, stock, category_id, is_featured, " +
      "DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s.%f') AS created_at " +
      "FROM products WHERE id = 44"
    );
    assert.equal(products[0].name, "Transfer Test Product");
    assert.equal(products[0].price, "123.4500000000", "decimal price should preserve exact scale");
    assert.equal(Number(products[0].stock), 17);
    assert.equal(Number(products[0].category_id), 43);
    assert.equal(Boolean(products[0].is_featured), true);
    assert.equal(products[0].created_at, "2022-02-03 04:05:06.123456", "timestamp microseconds must be preserved");

    const [variants] = await connection.query("SELECT attributes, sku FROM product_variants WHERE id = 45");
    const attributes = typeof variants[0].attributes === "string"
      ? JSON.parse(variants[0].attributes)
      : variants[0].attributes;
    assert.deepEqual(attributes, { color: "gold" }, "JSONB payload should survive transfer");
    assert.equal(variants[0].sku, null);

    const [sessionRows] = await connection.query("SELECT sess FROM session WHERE sid = ?", ["transfer-fixture-session"]);
    const session = typeof sessionRows[0].sess === "string"
      ? JSON.parse(sessionRows[0].sess)
      : sessionRows[0].sess;
    assert.equal(session.userId, 41, "session JSON should survive transfer");

    const [trackingRows] = await connection.query(
      "SELECT order_received_email_sent_at, payment_confirmation_email_sent_at FROM orders WHERE id = 47"
    );
    assert.equal(trackingRows[0].order_received_email_sent_at, null, "new order email tracking column should default to NULL");
    assert.equal(trackingRows[0].payment_confirmation_email_sent_at, null, "new payment email tracking column should default to NULL");

    const [withdrawalRows] = await connection.query(
      "SELECT confirmation_email_sent_at FROM withdrawal_requests WHERE id = 50"
    );
    assert.equal(withdrawalRows[0].confirmation_email_sent_at, null, "new withdrawal email tracking column should default to NULL");

    const [fkRows] = await connection.query(
      "SELECT COUNT(*) AS fk_count FROM information_schema.KEY_COLUMN_USAGE " +
      "WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL",
      [process.env.MYSQL_DATABASE]
    );
    assert.ok(Number(fkRows[0].fk_count) >= 10, "foreign keys should be present in transferred schema");

    console.log("PostgreSQL-to-MySQL transfer regression checks passed.");
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error("PostgreSQL-to-MySQL transfer regression failed:", error.message || "unknown error");
  process.exitCode = 1;
});
