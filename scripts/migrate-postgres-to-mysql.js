"use strict";

require("dotenv").config();
const { Pool, types } = require("pg");

// Preserve civil timestamps exactly (including microseconds) during transfer.
types.setTypeParser(1114, value => value);
const mysql = require("mysql2/promise");

const TABLES_IN_FK_ORDER = [
  { name: "users", key: "id" },
  { name: "categories", key: "id" },
  { name: "products", key: "id" },
  { name: "product_variants", key: "id" },
  { name: "product_images", key: "id" },
  { name: "orders", key: "id" },
  { name: "cart", key: "id" },
  { name: "order_items", key: "id" },
  { name: "session", key: "sid" },
  { name: "withdrawal_requests", key: "id" }
];

function identifier(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error("Unexpected identifier in database metadata.");
  }
  return name;
}

function validateValue(table, column, value, targetColumn, sourceColumn) {
  const label = table + "." + column;
  if (value === null || value === undefined) {
    if (targetColumn.IS_NULLABLE === "NO" && !String(targetColumn.EXTRA || "").toLowerCase().includes("auto_increment")) {
      throw new Error("Source contains NULL for a required MySQL column: " + label);
    }
    return;
  }

  const dataType = String(targetColumn.DATA_TYPE || "").toLowerCase();
  if (["varchar", "char", "enum", "set"].includes(dataType) && targetColumn.CHARACTER_MAXIMUM_LENGTH) {
    const length = [...String(value)].length;
    if (length > Number(targetColumn.CHARACTER_MAXIMUM_LENGTH)) {
      throw new Error(
        "Value exceeds MySQL column length at " + label +
        " (source length " + length + ", target limit " + targetColumn.CHARACTER_MAXIMUM_LENGTH + ")."
      );
    }
  }

  if (dataType === "decimal" || dataType === "numeric") {
    const precision = Number(targetColumn.NUMERIC_PRECISION);
    const scale = Number(targetColumn.NUMERIC_SCALE);
    const raw = String(value);
    const match = raw.match(/^[+-]?(\d+)(?:\.(\d*))?$/);
    if (!match) {
      throw new Error("Unexpected numeric representation at " + label + ".");
    }
    const integerDigits = match[1].replace(/^0+/, "").length;
    const fraction = match[2] || "";
    const significantFractionOverflow = fraction.slice(scale).some(digit => digit !== "0");
    if (integerDigits > precision - scale || significantFractionOverflow) {
      throw new Error(
        "Numeric value would lose precision at " + label +
        " (target DECIMAL(" + precision + "," + scale + "))."
      );
    }
  }

  if (["datetime", "timestamp", "date"].includes(dataType) && value instanceof Date && Number.isNaN(value.getTime())) {
    throw new Error("Invalid date value at " + label + ".");
  }

  // Keep the source type in the diagnostic path so JSON conversion can be done on insert.
  void sourceColumn;
}

function sourceConnection() {
  if (process.env.DATABASE_URL) {
    let url;
    try {
      url = new URL(process.env.DATABASE_URL);
    } catch {
      throw new Error("DATABASE_URL is not a valid PostgreSQL connection URL.");
    }
    if (!["postgres:", "postgresql:"].includes(url.protocol)) {
      throw new Error("DATABASE_URL must point to the PostgreSQL source; use MYSQL_* for the MySQL target.");
    }
    return new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 2,
      connectionTimeoutMillis: 10000,
      query_timeout: 60000,
      statement_timeout: 60000
    });
  }

  const required = ["DB_HOST", "DB_USER", "DB_NAME"];
  const missing = required.filter(name => !String(process.env[name] || "").trim());
  if (missing.length) throw new Error("Set the PostgreSQL source DB_HOST, DB_USER and DB_NAME or DATABASE_URL.");

  return new Pool({
    host: process.env.DB_HOST,
    port: Math.max(1, Math.min(65535, Number(process.env.DB_PORT) || 5432)),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASS || "",
    max: 2,
    connectionTimeoutMillis: 10000,
    query_timeout: 60000,
    statement_timeout: 60000
  });
}

function targetConnection() {
  const required = ["MYSQL_HOST", "MYSQL_DATABASE", "MYSQL_USER"];
  const missing = required.filter(name => !String(process.env[name] || "").trim());
  if (missing.length) throw new Error("Set MySQL target MYSQL_HOST, MYSQL_DATABASE and MYSQL_USER first.");

  return mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Math.max(1, Math.min(65535, Number(process.env.MYSQL_PORT) || 3306)),
    database: process.env.MYSQL_DATABASE,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD || "",
    connectTimeout: Math.max(1000, Math.min(30000, Number(process.env.MYSQL_CONNECT_TIMEOUT_MS) || 10000)),
    charset: "utf8mb4",
    timezone: process.env.MYSQL_TIMEZONE || "Z",
    supportBigNumbers: true,
    bigNumberStrings: false,
    decimalNumbers: false,
    ssl: process.env.MYSQL_SSL === "true"
      ? { rejectUnauthorized: process.env.MYSQL_SSL_REJECT_UNAUTHORIZED !== "false" }
      : undefined
  });
}

async function getSourceColumns(source, table) {
  const result = await source.query(
    "SELECT column_name, data_type, udt_name, ordinal_position " +
    "FROM information_schema.columns " +
    "WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position",
    [table]
  );
  return result.rows;
}

async function getTargetColumns(target, database, table) {
  const [rows] = await target.query(
    "SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, " +
    "CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE, EXTRA, GENERATION_EXPRESSION " +
    "FROM information_schema.columns WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION",
    [database, table]
  );
  return rows;
}

async function fetchSourceRows(source, table, key, columns) {
  const names = columns.map(column => '"' + identifier(column.column_name) + '"').join(", ");
  return source.query(
    'SELECT ' + names + ' FROM public."' + identifier(table) + '" ORDER BY "' + identifier(key) + '"'
  );
}

function checkUsernamePrefixUniqueness(rows) {
  const seen = new Set();
  for (const row of rows) {
    const prefix = [...String(row.username || "")].slice(0, 191).join("");
    if (seen.has(prefix)) {
      throw new Error("Two usernames share the MySQL unique-index prefix (191 characters); resolve the collision before transfer.");
    }
    seen.add(prefix);
  }
}

async function verifyExpectedTables(source, target, database) {
  const sourceResult = await source.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
  );
  const sourceNames = new Set(sourceResult.rows.map(row => row.table_name));
  const [targetRows] = await target.query(
    "SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'",
    [database]
  );
  const targetNames = new Set(targetRows.map(row => row.TABLE_NAME));

  for (const { name } of TABLES_IN_FK_ORDER) {
    if (!sourceNames.has(name)) throw new Error("PostgreSQL source is missing required table: " + name);
    if (!targetNames.has(name)) throw new Error("MySQL target is missing table: " + name + ". Apply the MySQL baseline first.");
  }

  if (sourceNames.size !== TABLES_IN_FK_ORDER.length) {
    const unhandled = [...sourceNames].filter(name => !TABLES_IN_FK_ORDER.some(table => table.name === name));
    throw new Error("PostgreSQL source has additional tables not included in the transfer: " + unhandled.join(", ") + ".");
  }

  if (targetNames.size !== TABLES_IN_FK_ORDER.length) {
    throw new Error("MySQL target has an unexpected table count. Use a fresh database containing only the 10-table baseline.");
  }

  for (const { name } of TABLES_IN_FK_ORDER) {
    const [countRows] = await target.query("SELECT COUNT(*) AS row_count FROM `" + name + "`");
    if (Number(countRows[0].row_count) !== 0) {
      throw new Error("MySQL target table " + name + " is not empty. Transfer stopped before writing any data.");
    }
  }
}

async function main() {
  if (process.env.MYSQL_MIGRATION_CONFIRM !== "TRANSFER_DATA_TO_EMPTY_MYSQL_TARGET") {
    throw new Error(
      "For safety, set MYSQL_MIGRATION_CONFIRM=TRANSFER_DATA_TO_EMPTY_MYSQL_TARGET only when the MySQL target is a fresh, empty migration database."
    );
  }

  const source = sourceConnection();
  let target;
  let transactionStarted = false;

  try {
    target = await targetConnection();
    const sourceMeta = await source.query("SELECT current_database() AS source_database");
    const [targetMetaRows] = await target.query("SELECT DATABASE() AS target_database, VERSION() AS version, @@version_comment AS version_comment");
    const targetMeta = targetMetaRows[0];
    const version = String(targetMeta.version || "");
    if (/mariadb/i.test(version + " " + String(targetMeta.version_comment || ""))) {
      throw new Error("This transfer script currently targets MySQL, not MariaDB.");
    }
    const versionParts = version.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!versionParts) throw new Error("Could not identify the MySQL server version.");
    const v = versionParts.slice(1).map(Number);
    if (v[0] < 8 || (v[0] === 8 && (v[1] < 0 || (v[1] === 0 && v[2] < 16)))) {
      throw new Error("MySQL 8.0.16 or newer is required for the baseline schema.");
    }
    await verifyExpectedTables(source, target, process.env.MYSQL_DATABASE);

    console.log("Source database:", sourceMeta.rows[0].source_database);
    console.log("Target database:", process.env.MYSQL_DATABASE);
    console.log("MySQL version:", version);
    console.log("Preflight passed: expected tables exist and all target tables are empty.");
    console.log("Preparing transfer; row values and credentials will not be printed.");

    await target.query("SET time_zone = '+00:00'");
    await target.beginTransaction();
    transactionStarted = true;
    const copiedCounts = {};

    for (const tableInfo of TABLES_IN_FK_ORDER) {
      const table = tableInfo.name;
      const sourceColumns = await getSourceColumns(source, table);
      const targetColumns = await getTargetColumns(target, process.env.MYSQL_DATABASE, table);
      const writableTargetColumns = targetColumns.filter(column =>
        !String(column.GENERATION_EXPRESSION || "").trim() &&
        !/(?:virtual|stored) generated/i.test(String(column.EXTRA || ""))
      );
      const targetByName = new Map(writableTargetColumns.map(column => [column.COLUMN_NAME, column]));
      const sourceNames = new Set(sourceColumns.map(column => column.column_name));

      const sourceColumnsMissingInTarget = sourceColumns
        .filter(column => !targetByName.has(column.column_name))
        .map(column => column.column_name);
      if (sourceColumnsMissingInTarget.length) {
        throw new Error(
          "MySQL target is missing source columns on " + table + ": " +
          sourceColumnsMissingInTarget.join(", ") + ". Transfer was rolled back."
        );
      }

      const sourceRows = await fetchSourceRows(source, table, tableInfo.key, sourceColumns);
      const rows = sourceRows.rows;
      const insertColumns = sourceColumns.map(column => column.column_name);
      const targetMetaByName = targetByName;
      for (const sourceColumn of sourceColumns) {
        const targetColumn = targetMetaByName.get(sourceColumn.column_name);
        for (const row of rows) {
          validateValue(table, sourceColumn.column_name, row[sourceColumn.column_name], targetColumn, sourceColumn);
        }
      }

      // Username is stored as TEXT and indexed by a 191-character prefix. The current
      // application caps usernames at 64 characters; this also catches legacy collisions.
      if (table === "users") checkUsernamePrefixUniqueness(rows);

      if (rows.length) {
        const quotedColumns = insertColumns.map(name => "`" + identifier(name) + "`").join(", ");
        const placeholders = insertColumns.map(() => "?").join(", ");
        const insertSql = "INSERT INTO `" + table + "` (" + quotedColumns + ") VALUES (" + placeholders + ")";
        for (const row of rows) {
          const values = insertColumns.map(name => {
            const value = row[name];
            const sourceColumn = sourceColumns.find(column => column.column_name === name);
            const targetColumn = targetMetaByName.get(name);
            const sourceType = String(sourceColumn.data_type || "").toLowerCase();
            const targetType = String(targetColumn.DATA_TYPE || "").toLowerCase();
            if (value !== null && value !== undefined &&
                ["json", "jsonb"].includes(sourceType) && targetType === "json") {
              return JSON.stringify(value);
            }
            return value;
          });
          await target.query(insertSql, values);
        }
      }

      const [countRows] = await target.query("SELECT COUNT(*) AS row_count FROM `" + table + "`");
      if (Number(countRows[0].row_count) !== rows.length) {
        throw new Error("Row-count mismatch detected after copying table " + table + ".");
      }

      // Verify that the source primary keys, including explicit IDs, survived transfer.
      const [targetKeys] = await target.query(
        "SELECT `" + identifier(tableInfo.key) + "` AS transfer_key FROM `" + table + "` ORDER BY `" + identifier(tableInfo.key) + "`"
      );
      for (let index = 0; index < rows.length; index++) {
        if (String(targetKeys[index]?.transfer_key) !== String(rows[index][tableInfo.key])) {
          throw new Error("Primary-key mismatch detected after copying table " + table + ".");
        }
      }

      copiedCounts[table] = rows.length;
      console.log("Prepared", table + ":", rows.length, "row(s)");
    }

    await target.commit();
    transactionStarted = false;
    console.log("Transfer committed. PostgreSQL was only read and remains unchanged.");
    console.log("Rows copied:", JSON.stringify(copiedCounts));
    console.log("Next: compare business data and run application regression tests before switching production.");
  } catch (error) {
    if (transactionStarted && target) await target.rollback().catch(() => {});
    const safeMessage = error?.message && (
      error.message.startsWith("Source ") ||
      error.message.startsWith("MySQL ") ||
      error.message.startsWith("PostgreSQL ") ||
      error.message.startsWith("Two usernames") ||
      error.message.startsWith("Value exceeds") ||
      error.message.startsWith("Numeric value") ||
      error.message.startsWith("Unexpected numeric") ||
      error.message.startsWith("Invalid date") ||
      error.message.startsWith("This transfer") ||
      error.message.startsWith("Could not identify") ||
      error.message.startsWith("For safety") ||
      error.message.startsWith("Set the PostgreSQL") ||
      error.message.startsWith("Set MySQL")
    ) ? error.message : null;
    console.error("PostgreSQL-to-MySQL transfer failed:", safeMessage || ("database error " + (error?.code || "unknown")));
    if (process.env.MYSQL_MIGRATION_DEBUG_ERRORS === "true" && error) {
      // Enable only for synthetic CI fixtures; database errors can contain SQL values.
      console.error("Synthetic transfer diagnostic:", error.stack || error.message || "no diagnostic available");
    }
    console.error("The MySQL transaction was rolled back when it had started. No source data was changed.");
    process.exitCode = 1;
  } finally {
    await source.end().catch(() => {});
    if (target) await target.end().catch(() => {});
  }
}

main().catch(error => {
  console.error("PostgreSQL-to-MySQL transfer could not start:", error?.message || "configuration error");
  process.exitCode = 1;
});
