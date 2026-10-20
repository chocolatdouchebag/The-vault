"use strict";

require("dotenv").config();
const { Pool, types } = require("pg");
const mysql = require("mysql2/promise");

types.setTypeParser(1114, value => value);

const BATCH_SIZE = 250;
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

function identifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error("Unexpected identifier in database metadata.");
  }
  return value;
}

function pgIdentifier(value) {
  return '"' + identifier(value) + '"';
}

function mysqlIdentifier(value) {
  const quote = String.fromCharCode(96);
  return quote + identifier(value) + quote;
}

function sourceKeyExpression(value) {
  const key = pgIdentifier(value);
  return value === "sid" ? "(" + key + ' COLLATE "C")' : key;
}

function targetKeyExpression(value) {
  const key = mysqlIdentifier(value);
  return value === "sid" ? "BINARY " + key : key;
}

function sourceConnection() {
  if (process.env.PG_SOURCE_URL) {
    let url;
    try {
      url = new URL(process.env.PG_SOURCE_URL);
    } catch {
      throw new Error("PG_SOURCE_URL is not a valid PostgreSQL connection URL.");
    }
    if (!["postgres:", "postgresql:"].includes(url.protocol)) {
      throw new Error("PG_SOURCE_URL must point to the PostgreSQL source.");
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
  if (missing.length) {
    throw new Error("Set Laravel target DB_HOST, DB_DATABASE and DB_USERNAME.");
  }

  const driver = String(process.env.DB_CONNECTION || "mysql").toLowerCase();
  if (!["mysql", "mariadb"].includes(driver)) {
    throw new Error("DB_CONNECTION must be mysql or mariadb for the Laravel target.");
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
    timezone: "Z",
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
    "SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.columns " +
    "WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION",
    [database, table]
  );
  return rows;
}

function sourceExpression(column) {
  const name = pgIdentifier(column.column_name);
  const type = String(column.data_type || "").toLowerCase();
  if (type === "json" || type === "jsonb") {
    return "CASE WHEN " + name + " IS NULL THEN NULL ELSE " + name + "::text END AS " + name;
  }
  if (type === "date") {
    return "to_char(" + name + ", 'YYYY-MM-DD') AS " + name;
  }
  if (type === "timestamp without time zone") {
    return "to_char(" + name + ", 'YYYY-MM-DD HH24:MI:SS.US') AS " + name;
  }
  if (type === "timestamp with time zone") {
    return "to_char(" + name + " AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') AS " + name;
  }
  return name;
}

function targetExpression(column) {
  const name = mysqlIdentifier(column.column_name);
  const type = String(column.data_type || "").toLowerCase();
  if (type === "date") {
    return "DATE_FORMAT(" + name + ", '%Y-%m-%d') AS " + name;
  }
  if (type === "timestamp without time zone" || type === "timestamp with time zone") {
    return "DATE_FORMAT(" + name + ", '%Y-%m-%d %H:%i:%s.%f') AS " + name;
  }
  if (type === "boolean") {
    return "CAST(" + name + " AS UNSIGNED) AS " + name;
  }
  if (type === "json" || type === "jsonb") {
    return "CAST(" + name + " AS CHAR) AS " + name;
  }
  return name;
}

function parseJson(value, table, column) {
  if (value === null || value === undefined) return value;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error("Invalid JSON detected at " + table + "." + column + ".");
  }
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    const result = {};
    for (const key of Object.keys(value).sort()) result[key] = stableValue(value[key]);
    return result;
  }
  return value;
}

function normalize(value, sourceColumn, table) {
  if (value === null || value === undefined) return null;
  const type = String(sourceColumn.data_type || "").toLowerCase();

  if (["json", "jsonb"].includes(type)) {
    return JSON.stringify(stableValue(parseJson(String(value), table, sourceColumn.column_name)));
  }
  if (type === "boolean") {
    return value === true || value === 1 || value === "1";
  }
  if (["smallint", "integer", "bigint", "smallserial", "serial", "bigserial"].includes(type)) {
    return String(value);
  }
  if (["numeric", "decimal"].includes(type)) {
    // PostgreSQL NUMERIC can retain a variable scale, while a migrated MySQL
    // DECIMAL has a fixed scale. Compare exact numeric value, not display padding.
    const match = String(value).match(/^([+-]?)(\\d+)(?:\\.(\\d*))?$/);
    if (!match) {
      throw new Error("Unexpected decimal representation at " + table + "." + sourceColumn.column_name + ".");
    }
    const sign = match[1] === "-" ? "-" : "";
    const integer = match[2].replace(/^0+(?=\\d)/, "");
    const fraction = (match[3] || "").replace(/0+$/, "");
    const canonical = integer + (fraction ? "." + fraction : "");
    return canonical === "0" ? "0" : sign + canonical;
  }
  return String(value);
}

async function nextSourceBatch(source, tableInfo, columns, cursor) {
  const key = sourceKeyExpression(tableInfo.key);
  const projection = columns.map(sourceExpression).join(", ");
  if (cursor === undefined) {
    return source.query(
      "SELECT " + projection + " FROM public." + pgIdentifier(tableInfo.name) +
      " ORDER BY " + key + " LIMIT $1",
      [BATCH_SIZE]
    );
  }
  return source.query(
    "SELECT " + projection + " FROM public." + pgIdentifier(tableInfo.name) +
    " WHERE " + key + " > $1 ORDER BY " + key + " LIMIT $2",
    [cursor, BATCH_SIZE]
  );
}

async function nextTargetBatch(target, tableInfo, columns, sourceColumns, cursor) {
  const key = targetKeyExpression(tableInfo.key);
  const projection = columns.map(column => targetExpression({
    column_name: column,
    data_type: sourceColumns.find(source => source.column_name === column).data_type
  })).join(", ");

  if (cursor === undefined) {
    const [rows] = await target.query(
      "SELECT " + projection + " FROM " + mysqlIdentifier(tableInfo.name) +
      " ORDER BY " + key + " LIMIT ?",
      [BATCH_SIZE]
    );
    return rows;
  }
  const [rows] = await target.query(
    "SELECT " + projection + " FROM " + mysqlIdentifier(tableInfo.name) +
    " WHERE " + key + " > " + (tableInfo.key === "sid" ? "BINARY ?" : "?") + " ORDER BY " + key + " LIMIT ?",
    [cursor, BATCH_SIZE]
  );
  return rows;
}

function failMismatch(table, rowNumber, column) {
  throw new Error(
    "Data mismatch in " + table + " at sorted row " + rowNumber +
    (column ? ", column " + column : " (primary key)") + "."
  );
}

async function verifyPrimaryImageSlots(target) {
  const [rows] = await target.query(
    "SELECT COUNT(*) AS mismatch_count FROM product_images " +
    "WHERE (is_primary = 1 AND (primary_slot IS NULL OR primary_slot <> 1)) " +
    "OR ((is_primary = 0 OR is_primary IS NULL) AND primary_slot IS NOT NULL)"
  );
  if (Number(rows[0]?.mismatch_count || 0) !== 0) {
    throw new Error("Primary-image uniqueness slots do not match product_images.is_primary.");
  }

  const [duplicates] = await target.query(
    "SELECT COUNT(*) AS duplicate_groups FROM (" +
    "SELECT product_id FROM product_images WHERE primary_slot = 1 " +
    "GROUP BY product_id HAVING COUNT(*) > 1" +
    ") AS duplicate_primary_images"
  );
  if (Number(duplicates[0]?.duplicate_groups || 0) !== 0) {
    throw new Error("More than one primary image exists for a product.");
  }
}

async function main() {
  if (process.env.LARAVEL_MIGRATION_VERIFY !== "COMPARE_POSTGRES_LARAVEL_DATA_READ_ONLY") {
    throw new Error(
      "For safety, set LARAVEL_MIGRATION_VERIFY=COMPARE_POSTGRES_LARAVEL_DATA_READ_ONLY to confirm this read-only comparison."
    );
  }

  const sourcePool = sourceConnection();
  let source;
  let target;
  let sourceTransaction = false;
  let targetTransaction = false;

  try {
    source = await sourcePool.connect();
    await source.query("BEGIN TRANSACTION READ ONLY");
    sourceTransaction = true;

    target = await targetConnection();
    await target.query("SET time_zone = '+00:00'");
    await target.query("START TRANSACTION READ ONLY");
    targetTransaction = true;

    const sourceMeta = await source.query("SELECT current_database() AS database_name");
    const [targetMetaRows] = await target.query(
      "SELECT DATABASE() AS database_name, VERSION() AS version, @@version_comment AS version_comment"
    );
    const sourceName = String(sourceMeta.rows[0]?.database_name || "");
    const targetName = String(targetMetaRows[0]?.database_name || "");
    if (!sourceName || !targetName) {
      throw new Error("Could not identify both source and target databases.");
    }

    console.log("Read-only comparison started.");
    console.log("PostgreSQL source database:", sourceName);
    console.log("Laravel target database:", targetName);
    console.log("Target engine:", String(targetMetaRows[0]?.version || ""));

    let totalRows = 0;
    for (const tableInfo of TABLES_IN_FK_ORDER) {
      const sourceColumns = await getSourceColumns(source, tableInfo.name);
      const targetColumns = await getTargetColumns(target, targetName, tableInfo.name);
      if (!sourceColumns.length) {
        throw new Error("PostgreSQL source is missing table " + tableInfo.name + ".");
      }
      if (!targetColumns.length) {
        throw new Error("Laravel target is missing table " + tableInfo.name + ".");
      }

      const targetNames = new Set(targetColumns.map(column => column.COLUMN_NAME));
      const missing = sourceColumns.filter(column => !targetNames.has(column.column_name));
      if (missing.length) {
        throw new Error(
          "Laravel target is missing source columns on " + tableInfo.name + ": " +
          missing.map(column => column.column_name).join(", ") + "."
        );
      }

      let cursor;
      let compared = 0;
      while (true) {
        const sourceResult = await nextSourceBatch(source, tableInfo, sourceColumns, cursor);
        const sourceRows = sourceResult.rows;
        const targetRows = await nextTargetBatch(
          target,
          tableInfo,
          sourceColumns.map(column => column.column_name),
          sourceColumns,
          cursor
        );

        if (sourceRows.length !== targetRows.length) {
          failMismatch(tableInfo.name, compared + Math.min(sourceRows.length, targetRows.length) + 1,
            "row count (source batch " + sourceRows.length + ", target batch " + targetRows.length + ")");
        }
        if (sourceRows.length === 0) break;

        for (let index = 0; index < sourceRows.length; index++) {
          const sourceRow = sourceRows[index];
          const targetRow = targetRows[index];
          const sourceKey = String(sourceRow[tableInfo.key]);
          const targetKey = String(targetRow[tableInfo.key]);
          if (sourceKey !== targetKey) {
            failMismatch(tableInfo.name, compared + index + 1, null);
          }

          for (const column of sourceColumns) {
            const name = column.column_name;
            const sourceValue = normalize(sourceRow[name], column, tableInfo.name);
            const targetValue = normalize(targetRow[name], column, tableInfo.name);
            if (sourceValue !== targetValue) {
              failMismatch(tableInfo.name, compared + index + 1, name);
            }
          }
        }

        compared += sourceRows.length;
        cursor = sourceRows[sourceRows.length - 1][tableInfo.key];
        if (sourceRows.length < BATCH_SIZE) break;
      }

      totalRows += compared;
      console.log("Verified", tableInfo.name + ":", compared, "row(s), all shared columns matched.");
    }

    await verifyPrimaryImageSlots(target);
    console.log("Verified product image primary slots.");
    console.log("Read-only PostgreSQL-to-Laravel data comparison passed. Total rows compared:", totalRows);
  } finally {
    if (source && sourceTransaction) await source.query("ROLLBACK").catch(() => {});
    if (target && targetTransaction) await target.query("ROLLBACK").catch(() => {});
    if (source) source.release();
    await sourcePool.end().catch(() => {});
    if (target) await target.end().catch(() => {});
  }
}

main().catch(error => {
  console.error("PostgreSQL-to-Laravel read-only verification failed:", error?.message || "unknown verification error");
  process.exitCode = 1;
});
