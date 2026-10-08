require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || undefined,
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: process.env.DB_PORT,
  max: Math.max(2, Math.min(50, Number(process.env.DB_POOL_MAX) || 10)),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  query_timeout: 15000,
  statement_timeout: 15000,
  maxUses: 5000,
});

pool.on("error", err => {
  console.error("PostgreSQL pool error:", err);
});

module.exports = pool;
