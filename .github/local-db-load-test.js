#!/usr/bin/env node
"use strict";

/*
 * FLIGALIGA real-PostgreSQL load test.
 *
 * Safety:
 * - Requires FLIGALIGA_DB_LOAD_TEST=1.
 * - Refuses NODE_ENV=production.
 * - Uses read-only queries and EXPLAIN ANALYZE.
 * - Does not modify products, orders, users, cart, or sessions.
 *
 * Run from the repository root:
 *   FLIGALIGA_DB_LOAD_TEST=1 node .github/local-db-load-test.js
 *
 * Optional:
 *   DB_LOAD_CONCURRENCY=25,50,100,200
 *   DB_LOAD_ROUNDS=3
 */

if (process.env.FLIGALIGA_DB_LOAD_TEST !== "1")
  throw new Error("Refusing to run. Set FLIGALIGA_DB_LOAD_TEST=1 explicitly.");

if (process.env.NODE_ENV === "production")
  throw new Error("Refusing to run with NODE_ENV=production.");

const path = require("path");
const pool = require(path.join(process.cwd(), "db.js"));

const rounds = Math.max(1, Math.min(10, Number(process.env.DB_LOAD_ROUNDS) || 3));
const concurrencyLevels = String(process.env.DB_LOAD_CONCURRENCY || "25,50,100,200")
  .split(",")
  .map(v => Number(v.trim()))
  .filter(Number.isInteger)
  .filter(v => v > 0 && v <= 500);

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

function msBetween(start) {
  return Number(process.hrtime.bigint() - start) / 1e6;
}

async function benchmarkQuery(sql, count) {
  const times = [];
  let errors = 0;

  const startAll = process.hrtime.bigint();

  for (let i = 0; i < count; i++) {
    const start = process.hrtime.bigint();
    try {
      await pool.query(sql);
      times.push(msBetween(start));
    } catch (err) {
      errors++;
      console.error("Query error:", err.message);
    }
  }

  return {
    totalMs: msBetween(startAll),
    count,
    errors,
    p50: percentile(times, 50),
    p95: percentile(times, 95),
    p99: percentile(times, 99),
    min: times.length ? Math.min(...times) : 0,
    max: times.length ? Math.max(...times) : 0
  };
}

async function concurrentBenchmark(sql, count) {
  const times = [];
  let errors = 0;

  const startAll = process.hrtime.bigint();

  await Promise.all(Array.from({ length: count }, async () => {
    const start = process.hrtime.bigint();
    try {
      await pool.query(sql);
      times.push(msBetween(start));
    } catch (err) {
      errors++;
    }
  }));

  return {
    totalMs: msBetween(startAll),
    count,
    errors,
    p50: percentile(times, 50),
    p95: percentile(times, 95),
    p99: percentile(times, 99),
    min: times.length ? Math.min(...times) : 0,
    max: times.length ? Math.max(...times) : 0
  };
}

function printBenchmark(label, result) {
  console.log(
    label +
    ": total=" + result.totalMs.toFixed(1) + "ms" +
    ", p50=" + result.p50.toFixed(1) + "ms" +
    ", p95=" + result.p95.toFixed(1) + "ms" +
    ", p99=" + result.p99.toFixed(1) + "ms" +
    ", min=" + result.min.toFixed(1) + "ms" +
    ", max=" + result.max.toFixed(1) + "ms" +
    ", errors=" + result.errors
  );
}

async function main() {
  console.log("FLIGALIGA real-PostgreSQL load test");
  console.log("------------------------------------");

  const info = await pool.query(`
    SELECT
      current_database() AS database_name,
      current_user AS database_user,
      current_setting('max_connections') AS max_connections,
      current_setting('shared_buffers') AS shared_buffers,
      current_setting('work_mem') AS work_mem
  `);
  console.log("Database:", info.rows[0].database_name);
  console.log("DB user:", info.rows[0].database_user);
  console.log("Postgres max_connections:", info.rows[0].max_connections);
  console.log("Postgres shared_buffers:", info.rows[0].shared_buffers);
  console.log("Postgres work_mem:", info.rows[0].work_mem);

  const productCount = await pool.query(
    "SELECT COUNT(*)::int AS count FROM products"
  );
  console.log("Products in DB:", productCount.rows[0].count);

  const indexInfo = await pool.query(
    "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'products' ORDER BY indexname"
  );
  console.log("Product indexes:");
  if (!indexInfo.rows.length) console.log("  (none)");
  for (const row of indexInfo.rows) console.log("  " + row.indexname + " :: " + row.indexdef);

  const catalogueSql =
    "SELECT * FROM products " +
    "WHERE is_active = TRUE AND status = 'active' " +
    "ORDER BY is_featured DESC, is_new_arrival DESC, id DESC";

  const explain = await pool.query(
    "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + catalogueSql
  );
  const plan = explain.rows[0]["QUERY PLAN"][0];
  console.log("Catalogue EXPLAIN:");
  console.log(JSON.stringify(plan, null, 2));

  const warmup = await benchmarkQuery(catalogueSql, 10);
  printBenchmark("Sequential catalogue x10", warmup);

  for (const concurrency of concurrencyLevels) {
    let aggregate = [];
    let totalErrors = 0;

    for (let round = 1; round <= rounds; round++) {
      const result = await concurrentBenchmark(catalogueSql, concurrency);
      printBenchmark("Concurrent " + concurrency + " round " + round, result);
      aggregate.push(result);
      totalErrors += result.errors;
    }

    const totalRequests = concurrency * rounds;
    const p95s = aggregate.map(r => r.p95);
    const p99s = aggregate.map(r => r.p99);

    console.log(
      "SUMMARY " + concurrency +
      ": " + totalRequests + " requests, " +
      "best p95=" + Math.min(...p95s).toFixed(1) + "ms, " +
      "worst p95=" + Math.max(...p95s).toFixed(1) + "ms, " +
      "worst p99=" + Math.max(...p99s).toFixed(1) + "ms, " +
      "errors=" + totalErrors
    );
    console.log("");
  }

  // Deliberately hold every configured pool connection briefly to expose
  // pool-wait behavior. This is local-only and read-only.
  const poolSize = Math.max(2, Math.min(50, Number(process.env.DB_POOL_MAX) || 10));
  const sleepSeconds = 1;

  console.log(
    "Pool saturation test: " + poolSize +
    " concurrent connections with pg_sleep(" + sleepSeconds + ")"
  );

  const saturation = await concurrentBenchmark(
    "SELECT pg_sleep(" + sleepSeconds + ")",
    poolSize * 2
  );

  printBenchmark("Pool saturation", saturation);
  console.log(
    "Expected behavior: roughly two waves because the configured pool has " +
    poolSize + " connections."
  );

  console.log("");
  console.log("DONE — no application data was written by this test.");
}

main()
  .catch(err => {
    console.error("LOAD TEST FAILED:", err.stack || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
