"use strict";

const assert = require("node:assert/strict");
const { translateQuery, buildReturningSelect } = require("../mysql-compat");

{
  const translated = translateQuery(
    "SELECT * FROM sample WHERE second_value = $2 AND first_value = $1 AND repeat_value = $2",
    ["first", "second"]
  );
  assert.equal(
    translated.sql,
    "SELECT * FROM sample WHERE second_value = ? AND first_value = ? AND repeat_value = ?"
  );
  assert.deepEqual(translated.values, ["second", "first", "second"]);
}

{
  const translated = translateQuery(
    "INSERT INTO orders (payment_expires_at) VALUES (CURRENT_TIMESTAMP + make_interval(mins => $9::integer)) RETURNING id",
    [1, 2, 3, 4, 5, 6, 7, 8, 30]
  );
  assert.equal(
    translated.sql,
    "INSERT INTO orders (payment_expires_at) VALUES (DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? MINUTE))"
  );
  assert.deepEqual(translated.values, [30]);
  assert.equal(translated.returning, "id");
}

{
  const translated = translateQuery(
    "SELECT c.id FROM cart c JOIN products p ON p.id = c.product_id WHERE c.user_id = $1 FOR UPDATE OF c, p",
    [7]
  );
  assert.match(translated.sql, /FOR UPDATE$/);
  assert.doesNotMatch(translated.sql, /FOR UPDATE OF/i);
  assert.deepEqual(translated.values, [7]);
}

{
  const translated = translateQuery(
    "INSERT INTO session (sid, sess) VALUES ($1, $2::json) ON CONFLICT (sid) DO UPDATE SET sess = EXCLUDED.sess, expire = EXCLUDED.expire",
    ["sid", "{\"ok\":true}"]
  );
  assert.match(translated.sql, /CAST\(\? AS JSON\)/);
  assert.match(translated.sql, /ON DUPLICATE KEY UPDATE sess = VALUES\(sess\), expire = VALUES\(expire\)/);
  assert.deepEqual(translated.values, ["sid", "{\"ok\":true}"]);
}

{
  const query = translateQuery(
    "UPDATE products SET name = $1 WHERE id = $2 RETURNING *",
    ["updated name", 42]
  );
  assert.equal(query.returning, "*");
  assert.equal(query.sql, "UPDATE products SET name = ? WHERE id = ?");
  assert.deepEqual(
    buildReturningSelect({
      originalSql: query.originalSql,
      returning: query.returning,
      parameters: ["updated name", 42]
    }),
    { sql: "SELECT * FROM `products` WHERE id = ?", values: [42] }
  );
}

{
  const query = translateQuery(
    "INSERT INTO withdrawal_requests (email) VALUES ($1) RETURNING id, order_id, email, reason, submitted_at",
    ["buyer@example.test"]
  );
  assert.deepEqual(
    buildReturningSelect({
      originalSql: query.originalSql,
      returning: query.returning,
      parameters: ["buyer@example.test"],
      insertId: 17
    }),
    {
      sql: "SELECT id, order_id, email, reason, submitted_at FROM `withdrawal_requests` WHERE id = ?",
      values: [17]
    }
  );
}

assert.throws(
  () => translateQuery("SELECT * FROM sample WHERE id = $2", [1]),
  /has no matching value/
);

console.log("MySQL SQL compatibility regression checks passed.");
