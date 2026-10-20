"use strict";

const assert = require("node:assert/strict");
const mysql = require("mysql2/promise");

async function main() {
  const required = ["DB_HOST", "DB_DATABASE", "DB_USERNAME"];
  const missing = required.filter(key => !String(process.env[key] || "").trim());
  if (missing.length) {
    throw new Error("Laravel transfer test requires the disposable CI DB_HOST, DB_DATABASE and DB_USERNAME settings.");
  }

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Math.max(1, Math.min(65535, Number(process.env.DB_PORT) || 3306)),
    database: process.env.DB_DATABASE,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD || "",
    connectTimeout: 10000,
    charset: "utf8mb4",
    timezone: "Z",
    supportBigNumbers: true,
    bigNumberStrings: false,
    decimalNumbers: false,
    ssl: process.env.MYSQL_SSL === "true"
      ? { rejectUnauthorized: process.env.MYSQL_SSL_REJECT_UNAUTHORIZED !== "false" }
      : undefined
  });
  const quote = String.fromCharCode(96);

  try {
    const expectedCounts = {
      users: 1,
      categories: 1,
      products: 1,
      product_variants: 1,
      product_images: 2,
      orders: 1,
      cart: 1,
      order_items: 1,
      session: 1,
      withdrawal_requests: 1
    };

    const expectedKeys = {
      users: ["id", 41],
      categories: ["id", 43],
      products: ["id", 44],
      product_variants: ["id", 45],
      product_images: ["id", 46],
      orders: ["id", 47],
      cart: ["id", 48],
      order_items: ["id", 49],
      session: ["sid", "transfer-fixture-session"],
      withdrawal_requests: ["id", 50]
    };

    for (const [table, expectedCount] of Object.entries(expectedCounts)) {
      const [counts] = await connection.query("SELECT COUNT(*) AS row_count FROM " + quote + table + quote);
      assert.equal(Number(counts[0].row_count), expectedCount, table + " transferred row count");
    }

    for (const [table, [key, expected]] of Object.entries(expectedKeys)) {
      const [rows] = await connection.query(
        "SELECT " + quote + key + quote + " AS transfer_key FROM " + quote + table + quote +
        " ORDER BY " + quote + key + quote
      );
      assert.equal(String(rows[0]?.transfer_key), String(expected), table + " primary key should be preserved");
    }

    const [products] = await connection.query(
      "SELECT name, CAST(price AS CHAR) AS price, stock, category_id, is_featured, " +
      "DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s.%f') AS created_at " +
      "FROM products WHERE id = 44"
    );
    assert.equal(products[0].name, "Transfer Test Product");
    assert.equal(products[0].price, "123.4500000000", "decimal price keeps exact scale");
    assert.equal(Number(products[0].stock), 17);
    assert.equal(Number(products[0].category_id), 43);
    assert.equal(Boolean(products[0].is_featured), true);
    assert.equal(products[0].created_at, "2022-02-03 04:05:06.123456", "timestamp microseconds are preserved");

    const [variants] = await connection.query("SELECT attributes, sku FROM product_variants WHERE id = 45");
    const attributes = typeof variants[0].attributes === "string"
      ? JSON.parse(variants[0].attributes)
      : variants[0].attributes;
    assert.deepEqual(attributes, { color: "gold" }, "JSONB payload survives transfer");
    assert.equal(variants[0].sku, null, "a NULL variant SKU stays NULL");

    const [images] = await connection.query(
      "SELECT id, is_primary, primary_slot, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s.%f') AS created_at " +
      "FROM product_images WHERE product_id = 44 ORDER BY id"
    );
    assert.equal(Number(images[0].id), 46);
    assert.equal(Boolean(images[0].is_primary), true);
    assert.equal(Number(images[0].primary_slot), 1, "primary image receives the Laravel uniqueness slot");
    assert.equal(images[0].created_at, "2022-02-03 04:05:06.123456");
    assert.equal(Number(images[1].id), 51);
    assert.equal(Boolean(images[1].is_primary), false);
    assert.equal(images[1].primary_slot, null, "non-primary image leaves the uniqueness slot NULL");
    assert.equal(images[1].created_at, "2022-02-03 04:05:06.223456");

    const [sessionRows] = await connection.query(
      "SELECT sess FROM " + quote + "session" + quote + " WHERE sid = ?",
      ["transfer-fixture-session"]
    );
    const session = typeof sessionRows[0].sess === "string"
      ? JSON.parse(sessionRows[0].sess)
      : sessionRows[0].sess;
    assert.equal(session.userId, 41, "session JSON survives transfer");

    const [trackingRows] = await connection.query(
      "SELECT order_received_email_sent_at, payment_confirmation_email_sent_at FROM orders WHERE id = 47"
    );
    assert.equal(trackingRows[0].order_received_email_sent_at, null);
    assert.equal(trackingRows[0].payment_confirmation_email_sent_at, null);

    const [withdrawalRows] = await connection.query(
      "SELECT confirmation_email_sent_at FROM withdrawal_requests WHERE id = 50"
    );
    assert.equal(withdrawalRows[0].confirmation_email_sent_at, null);

    const [fkRows] = await connection.query(
      "SELECT COUNT(*) AS fk_count FROM information_schema.KEY_COLUMN_USAGE " +
      "WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL",
      [process.env.DB_DATABASE]
    );
    assert.ok(Number(fkRows[0].fk_count) >= 10, "foreign-key constraints remain in place");

    const [migrations] = await connection.query(
      "SELECT COUNT(*) AS row_count FROM " + quote + "migrations" + quote
    );
    assert.equal(Number(migrations[0].row_count), 4, "Laravel migration history is preserved");
    const [cacheRows] = await connection.query("SELECT COUNT(*) AS row_count FROM cache");
    assert.equal(Number(cacheRows[0].row_count), 0, "cache remains empty after transfer");

    console.log("PostgreSQL-to-Laravel-MySQL synthetic transfer checks passed.");
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error("PostgreSQL-to-Laravel-MySQL synthetic transfer test failed:", error.message || "unknown error");
  process.exitCode = 1;
});
