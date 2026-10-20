"use strict";

require("dotenv").config();
const mysql = require("mysql2/promise");
const { translateQuery, buildReturningSelect } = require("./mysql-compat");

const required = ["MYSQL_HOST", "MYSQL_DATABASE", "MYSQL_USER"];
const missing = required.filter(name => !String(process.env[name] || "").trim());
if (missing.length) {
  throw new Error(
    "MySQL is not configured. Set MYSQL_HOST, MYSQL_DATABASE and MYSQL_USER (plus MYSQL_PASSWORD if required). " +
    "The existing DB_* / DATABASE_URL settings are retained for the PostgreSQL source and export only."
  );
}

const connectionLimit = Math.max(
  2,
  Math.min(50, Number(process.env.MYSQL_CONNECTION_LIMIT) || 10)
);

const mysqlPool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: Math.max(1, Math.min(65535, Number(process.env.MYSQL_PORT) || 3306)),
  database: process.env.MYSQL_DATABASE,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD || "",
  waitForConnections: true,
  connectionLimit,
  queueLimit: 0,
  connectTimeout: Math.max(1000, Math.min(30000, Number(process.env.MYSQL_CONNECT_TIMEOUT_MS) || 10000)),
  charset: "utf8mb4",
  timezone: "Z",
  supportBigNumbers: true,
  bigNumberStrings: false,
  decimalNumbers: false,
  ssl: process.env.MYSQL_SSL === "true"
    ? { rejectUnauthorized: process.env.MYSQL_SSL_REJECT_UNAUTHORIZED !== "false" }
    : undefined
});

// Store DATETIME values and CURRENT_TIMESTAMP consistently in UTC regardless of host defaults.
mysqlPool.pool.on("connection", connection => {
  connection.query("SET time_zone = '+00:00'", error => {
    if (error) console.error("Could not set MySQL session timezone to UTC:", error.code || "unknown error");
  });
});

function normalizeDatabaseError(error) {
  if (!error || typeof error !== "object") return error;
  if (error.code === "ER_DUP_ENTRY" || error.errno === 1062) error.code = "23505";
  else if (error.code === "ER_BAD_FIELD_ERROR" || error.errno === 1054) error.code = "42703";
  else if (error.code === "ER_NO_SUCH_TABLE" || error.errno === 1146) error.code = "42P01";
  return error;
}

function sanitizeRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(row => {
    if (!row || typeof row !== "object" || Array.isArray(row) || Buffer.isBuffer(row)) return row;
    const copy = { ...row };
    // MySQL needs these generated columns to emulate PostgreSQL partial uniqueness.
    // They are implementation details and are not part of the original application schema.
    delete copy.unique_name_image_hash;
    delete copy.primary_product_id;
    return copy;
  });
}

async function executeTranslated(target, translated) {
  try {
    const [result] = await target.query(translated.sql, translated.values);

    // SELECT and other row-producing statements return an array from mysql2.
    if (Array.isArray(result)) {
      return { rows: sanitizeRows(result), rowCount: result.length };
    }

    let rows = [];
    if (translated.returning) {
      const isInsertIdOnly =
        /^\s*INSERT\b/i.test(translated.originalSql) &&
        /^id$/i.test(translated.returning) &&
        Number(result.insertId) > 0;

      if (isInsertIdOnly) {
        rows = [{ id: result.insertId }];
      } else {
        const select = buildReturningSelect({
          originalSql: translated.originalSql,
          returning: translated.returning,
          parameters: translated.originalParameters,
          insertId: result.insertId
        });
        if (select) {
          const [selectedRows] = await target.query(select.sql, select.values);
          rows = sanitizeRows(selectedRows);
        }
      }
    }

    return {
      rows,
      rowCount: Number(result.affectedRows) || 0,
      insertId: result.insertId || 0
    };
  } catch (error) {
    throw normalizeDatabaseError(error);
  }
}

function parseQuery(sql, values) {
  return translateQuery(sql, values);
}

const pool = {
  async query(sql, values = []) {
    const translated = parseQuery(sql, values);
    // Keep UPDATE/INSERT + emulated RETURNING on one connection to avoid a race
    // between the write and the follow-up SELECT.
    if (!translated.returning) return executeTranslated(mysqlPool, translated);

    const connection = await mysqlPool.getConnection();
    try {
      return await executeTranslated(connection, translated);
    } finally {
      connection.release();
    }
  },

  async connect() {
    const connection = await mysqlPool.getConnection();
    return {
      query(sql, values = []) {
        return executeTranslated(connection, parseQuery(sql, values));
      },
      release() {
        connection.release();
      }
    };
  },

  on(event, handler) {
    if (mysqlPool.pool && typeof mysqlPool.pool.on === "function") {
      mysqlPool.pool.on(event, handler);
    }
    return pool;
  },

  end() {
    return mysqlPool.end();
  }
};

pool.on("error", error => {
  console.error("MySQL pool error:", error?.code || error?.message || "unknown error");
});

module.exports = pool;
