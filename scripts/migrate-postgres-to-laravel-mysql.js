"use strict";

require("dotenv").config();
const { Pool, types } = require("pg");

// Preserve civil timestamps exactly (including microseconds) during transfer.
types.setTypeParser(1114, value => value);
const mysql = require("mysql2/promise");

const LARAVEL_FRAMEWORK_TABLES = ["migrations", "cache", "cache_locks", "jobs", "job_batches", "failed_jobs"];
const LARAVEL_EMPTY_FRAMEWORK_TABLES = ["cache", "cache_locks", "jobs", "job_batches", "failed_jobs"];
const EXPECTED_LARAVEL_MIGRATIONS = [
  "0001_01_01_000000_create_users_table",
  "0001_01_01_000001_create_cache_table",
  "0001_01_01_000002_create_jobs_table",
  "2026_10_20_000003_create_fligaliga_tables"
];

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
    const significantFractionOverflow = /[1-9]/.test(fraction.slice(scale));
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
  if (process.env.PG_SOURCE_URL) {
    let url;
    try {
      url = new URL(process.env.PG_SOURCE_URL);
    } catch {
      throw new Error("PG_SOURCE_URL is not a valid PostgreSQL source connection URL.");
    }
    if (!["postgres:", "postgresql:"].includes(url.protocol)) {
      throw new Error("PG_SOURCE_URL must point to PostgreSQL; Laravel DB_* values are reserved for the target.");
    }
    return new Pool({
      connectionString: process.env.PG_SOURCE_URL,
      max: 2,
      connectionTimeoutMillis: 10000,
      query_timeout: 60000,
      statement_timeout: 60000,
      ssl: process.env.PG_SOURCE_SSL === "true"
        ? { rejectUnauthorized: process.env.PG_SOURCE_SSL_REJECT_UNAUTHORIZED !== "false" }
        : undefined
    });
  }

  const required = ["PG_SOURCE_HOST", "PG_SOURCE_DATABASE", "PG_SOURCE_USER"];
  const missing = required.filter(name => !String(process.env[name] || "").trim());
  if (missing.length) {
    throw new Error("Set PG_SOURCE_HOST, PG_SOURCE_DATABASE and PG_SOURCE_USER, or provide PG_SOURCE_URL.");
  }

  return new Pool({
    host: process.env.PG_SOURCE_HOST,
    port: Math.max(1, Math.min(65535, Number(process.env.PG_SOURCE_PORT) || 5432)),
    database: process.env.PG_SOURCE_DATABASE,
    user: process.env.PG_SOURCE_USER,
    password: process.env.PG_SOURCE_PASSWORD || "",
    max: 2,
    connectionTimeoutMillis: 10000,
    query_timeout: 60000,
    statement_timeout: 60000,
    ssl: process.env.PG_SOURCE_SSL === "true"
      ? { rejectUnauthorized: process.env.PG_SOURCE_SSL_REJECT_UNAUTHORIZED !== "false" }
      : undefined
  });
}

function targetConnection() {
  const required = ["DB_HOST", "DB_DATABASE", "DB_USERNAME"];
  const missing = required.filter(name => !String(process.env[name] || "").trim());
  if (missing.length) throw new Error("Set Laravel target DB_HOST, DB_DATABASE and DB_USERNAME first.");
  const driver = String(process.env.DB_CONNECTION || "mysql").toLowerCase();
  if (!["mysql", "mariadb"].includes(driver)) {
    throw new Error("DB_CONNECTION must be mysql or mariadb for the Laravel migration target.");
  }

  const sslCa = process.env.MYSQL_ATTR_SSL_CA || "";
  const useSsl = process.env.MYSQL_SSL === "true" || Boolean(sslCa);
  return mysql.createConnection({
    host: process.env.DB_HOST,
    port: Math.max(1, Math.min(65535, Number(process.env.DB_PORT) || 3306)),
    database: process.env.DB_DATABASE,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD || "",
    connectTimeout: Math.max(1000, Math.min(30000, Number(process.env.DB_CONNECT_TIMEOUT_MS) || 10000)),
    charset: "utf8mb4",
    timezone: process.env.DB_TIMEZONE || "Z",
    supportBigNumbers: true,
    bigNumberStrings: false,
    decimalNumbers: false,
    ssl: useSsl
      ? {
          rejectUnauthorized: process.env.MYSQL_SSL_REJECT_UNAUTHORIZED !== "false",
          ...(sslCa ? { ca: require("node:fs").readFileSync(sslCa, "utf8") } : {})
        }
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
    if (!targetNames.has(name)) throw new Error("Laravel target is missing business table: " + name + ". Run the Laravel migrations first.");
  }
  if (sourceNames.size !== TABLES_IN_FK_ORDER.length) {
    const unhandled = [...sourceNames].filter(name => !TABLES_IN_FK_ORDER.some(table => table.name === name));
    throw new Error("PostgreSQL source has additional tables not included in the transfer: " + unhandled.join(", ") + ".");
  }

  const expectedTargetNames = new Set([
    ...TABLES_IN_FK_ORDER.map(table => table.name),
    ...LARAVEL_FRAMEWORK_TABLES
  ]);
  const unexpected = [...targetNames].filter(name => !expectedTargetNames.has(name));
  if (unexpected.length) {
    throw new Error("Laravel target has unexpected tables: " + unexpected.join(", ") + ". Use a fresh staging database.");
  }
  for (const name of LARAVEL_FRAMEWORK_TABLES) {
    if (!targetNames.has(name)) throw new Error("Laravel target is missing framework table: " + name + ".");
  }

  const [migrationRows] = await target.query("SELECT migration FROM " + "`" + "migrations" + "`");
  const migrationNames = new Set(migrationRows.map(row => row.migration));
  for (const expected of EXPECTED_LARAVEL_MIGRATIONS) {
    if (!migrationNames.has(expected)) throw new Error("Laravel target is missing migration record: " + expected + ".");
  }
  if (migrationNames.size !== EXPECTED_LARAVEL_MIGRATIONS.length) {
    throw new Error("Laravel target has an unexpected migration set. Review this transfer utility before continuing.");
  }

  for (const { name } of TABLES_IN_FK_ORDER) {
    const [countRows] = await target.query("SELECT COUNT(*) AS row_count FROM " + "`" + name + "`");
    if (Number(countRows[0].row_count) !== 0) {
      throw new Error("Laravel target business table " + name + " is not empty. Transfer stopped before writing data.");
    }
  }
  for (const name of LARAVEL_EMPTY_FRAMEWORK_TABLES) {
    const [countRows] = await target.query("SELECT COUNT(*) AS row_count FROM " + "`" + name + "`");
    if (Number(countRows[0].row_count) !== 0) {
      throw new Error("Laravel target framework table " + name + " is not empty. Use a fresh staging database.");
    }
  }
}

async function main() {
  if (process.env.LARAVEL_MIGRATION_CONFIRM !== "TRANSFER_DATA_TO_EMPTY_LARAVEL_DATABASE") {
    throw new Error(
      "For safety, set LARAVEL_MIGRATION_CONFIRM=TRANSFER_DATA_TO_EMPTY_LARAVEL_DATABASE only for a disposable migrated Laravel target with empty business tables."
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
    const isMariaDb = /mariadb/i.test(version + " " + String(targetMeta.version_comment || ""));
    const versionParts = version.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!versionParts) throw new Error("Could not identify the MySQL/MariaDB server version.");
    const v = versionParts.slice(1).map(Number);
    if (isMariaDb) {
      if (v[0] < 10 || (v[0] === 10 && v[1] < 11)) {
        throw new Error("MariaDB 10.11 or newer is required for the tested Laravel schema.");
      }
    } else if (v[0] < 8 || (v[0] === 8 && (v[1] < 0 || (v[1] === 0 && v[2] < 16)))) {
      throw new Error("MySQL 8.0.16 or newer is required for the Laravel schema.");
    }
    await verifyExpectedTables(source, target, process.env.DB_DATABASE);

    console.log("PostgreSQL source database:", sourceMeta.rows[0].source_database);
    console.log("Laravel target database:", process.env.DB_DATABASE);
    console.log("Target engine version:", version);
    console.log("Preflight passed: Laravel migrations match this utility and all business/queue tables are empty.");
    console.log("Preparing transfer; row values and credentials will not be printed.");

    await target.query("SET time_zone = '+00:00'");
    await target.beginTransaction();
    transactionStarted = true;
    const copiedCounts = {};

    for (const tableInfo of TABLES_IN_FK_ORDER) {
      const table = tableInfo.name;
      const sourceColumns = await getSourceColumns(source, table);
      const targetColumns = await getTargetColumns(target, process.env.DB_DATABASE, table);
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
      // The Laravel schema uses a nullable slot to preserve the PostgreSQL partial
      // unique index on primary images when transferring to MySQL/MariaDB.
      if (table === "product_images" && targetByName.has("primary_slot") && !sourceNames.has("primary_slot")) {
        insertColumns.push("primary_slot");
      }
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
            if (table === "product_images" && name === "primary_slot") return row.is_primary ? 1 : null;
            const value = row[name];
            const sourceColumn = sourceColumns.find(column => column.column_name === name);
            const targetColumn = targetMetaByName.get(name);
            const sourceType = String(sourceColumn.data_type || "").toLowerCase();
            const targetType = String(targetColumn.DATA_TYPE || "").toLowerCase();
            // MariaDB exposes JSON columns as LONGTEXT plus a JSON_VALID constraint,
            // while MySQL exposes DATA_TYPE as "json". Serialize source JSON for both.
            if (value !== null && value !== undefined &&
                ["json", "jsonb"].includes(sourceType) &&
                ["json", "longtext", "text"].includes(targetType)) {
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
      error.message.startsWith("Laravel ") ||
      error.message.startsWith("Target ") ||
      error.message.startsWith("Framework ") ||
      error.message.startsWith("Value exceeds") ||
      error.message.startsWith("Numeric value") ||
      error.message.startsWith("Unexpected numeric") ||
      error.message.startsWith("Invalid date") ||
      error.message.startsWith("This transfer") ||
      error.message.startsWith("Could not identify") ||
      error.message.startsWith("MariaDB ") ||
      error.message.startsWith("MySQL/MariaDB ") ||
      error.message.startsWith("For safety") ||
      error.message.startsWith("Set PG_SOURCE") ||
      error.message.startsWith("Set Laravel target")
    ) ? error.message : null;
    console.error("PostgreSQL-to-Laravel-MySQL transfer failed:", safeMessage || ("database error " + (error?.code || "unknown")));
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
  console.error("PostgreSQL-to-Laravel-MySQL transfer could not start:", error?.message || "configuration error");
  process.exitCode = 1;
});
