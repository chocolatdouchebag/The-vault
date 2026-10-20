"use strict";

require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const mysql = require("mysql2/promise");

function versionAtLeast(version, minimum) {
  const current = String(version).match(/^(\d+)\.(\d+)\.(\d+)/);
  const target = minimum;
  if (!current) return false;
  const a = current.slice(1).map(Number);
  for (let i = 0; i < target.length; i++) {
    if (a[i] > target[i]) return true;
    if (a[i] < target[i]) return false;
  }
  return true;
}

async function main() {
  const required = ["MYSQL_HOST", "MYSQL_DATABASE", "MYSQL_USER"];
  const missing = required.filter(name => !String(process.env[name] || "").trim());
  if (missing.length) {
    throw new Error("Set MYSQL_HOST, MYSQL_DATABASE and MYSQL_USER in the local .env first.");
  }

  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Math.max(1, Math.min(65535, Number(process.env.MYSQL_PORT) || 3306)),
    database: process.env.MYSQL_DATABASE,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD || "",
    connectTimeout: Math.max(1000, Math.min(30000, Number(process.env.MYSQL_CONNECT_TIMEOUT_MS) || 10000)),
    charset: "utf8mb4",
    timezone: process.env.MYSQL_TIMEZONE || "local",
    ssl: process.env.MYSQL_SSL === "true"
      ? { rejectUnauthorized: process.env.MYSQL_SSL_REJECT_UNAUTHORIZED !== "false" }
      : undefined
  });

  try {
    const [versions] = await connection.query("SELECT VERSION() AS version, @@version_comment AS version_comment");
    const version = String(versions[0]?.version || "");
    const comment = String(versions[0]?.version_comment || "");
    if (/mariadb/i.test(version + " " + comment)) {
      throw new Error("This baseline targets MySQL, not MariaDB. Confirm the provider's database product before proceeding.");
    }
    if (!versionAtLeast(version, [8, 0, 16])) {
      throw new Error("MySQL 8.0.16 or newer is required so the schema's CHECK constraints are enforced.");
    }

    const [existing] = await connection.query(
      "SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'",
      [process.env.MYSQL_DATABASE]
    );
    if (existing.length) {
      throw new Error(
        "Refusing to create the baseline in a non-empty database (" + existing.length +
        " existing table(s)). Use a fresh, empty migration database; nothing was changed."
      );
    }

    const schemaPath = path.join(__dirname, "..", "migrations", "mysql", "001_baseline.sql");
    const schema = fs.readFileSync(schemaPath, "utf8");
    // This checked-in baseline intentionally contains no semicolons inside quoted values.
    const statements = schema.split(/;\s*(?:\r?\n|$)/).map(part => part.trim()).filter(Boolean);
    for (const statement of statements) {
      await connection.query(statement);
    }

    const [tables] = await connection.query(
      "SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
      [process.env.MYSQL_DATABASE]
    );
    const names = tables.map(row => row.TABLE_NAME);
    const expected = [
      "cart", "categories", "order_items", "orders", "product_images",
      "product_variants", "products", "session", "users", "withdrawal_requests"
    ];
    const missingTables = expected.filter(name => !names.includes(name));
    if (missingTables.length || names.length !== expected.length) {
      throw new Error("Schema was executed but the table list did not match the expected 10-table baseline.");
    }

    console.log("MySQL version:", version);
    console.log("Created FLIGALIGA baseline in database:", process.env.MYSQL_DATABASE);
    console.log("Tables created:", names.join(", "));
    console.log("This script only creates an empty schema; it does not copy PostgreSQL data or change PostgreSQL.");
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error("MySQL schema setup failed:", error.message || "unknown error");
  console.error("If creation stopped partway through, use a fresh empty migration database on the next attempt; this script never drops tables.");
  process.exitCode = 1;
});
