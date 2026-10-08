#!/usr/bin/env node
"use strict";

/*
 * FLIGALIGA isolated PostgreSQL catalogue scaling test.
 *
 * Safety:
 * - Requires FLIGALIGA_DB_CATALOGUE_TEST=1.
 * - Refuses NODE_ENV=production.
 * - Uses only a TEMP table in one PostgreSQL session.
 * - Does not insert, update, or delete rows from public.products.
 *
 * Run from repository root:
 *   FLIGALIGA_DB_CATALOGUE_TEST=1 node .github/local-db-catalogue-scaling-test.js
 *
 * Optional:
 *   DB_CATALOGUE_SIZES=1000,5000,10000,25000,50000
 */

if (process.env.FLIGALIGA_DB_CATALOGUE_TEST !== "1") {
  throw new Error("Refusing to run. Set FLIGALIGA_DB_CATALOGUE_TEST=1 explicitly.");
}

if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to run with NODE_ENV=production.");
}

const path = require("path");
const pool = require(path.join(process.cwd(), "db.js"));

const sizes = String(
  process.env.DB_CATALOGUE_SIZES || "1000,5000,10000,25000,50000"
)
  .split(",")
  .map(v => Number(v.trim()))
  .filter(Number.isInteger)
  .filter(v => v > 0 && v <= 100000)
  .sort((a, b) => a - b);

function msBetween(start) {
  return Number(process.hrtime.bigint() - start) / 1e6;
}

async function benchmark(client, sql, count = 10) {
  const times = [];
  for (let i = 0; i < count; i++) {
    const start = process.hrtime.bigint();
    await client.query(sql);
    times.push(msBetween(start));
  }

  times.sort((a, b) => a - b);

  const percentile = p => {
    const index = Math.min(times.length - 1, Math.ceil((p / 100) * times.length) - 1);
    return times[Math.max(0, index)];
  };

  return {
    p50: percentile(50),
    p95: percentile(95),
    p99: percentile(99),
    min: times[0],
    max: times[times.length - 1]
  };
}

async function main() {
  console.log("FLIGALIGA isolated PostgreSQL catalogue scaling test");
  console.log("----------------------------------------------------");
  console.log("Safety mode: TEMP TABLE ONLY — public.products is untouched");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(`
      CREATE TEMP TABLE catalogue_scaling_products
      (LIKE public.products INCLUDING DEFAULTS)
      ON COMMIT DROP
    `);

    // Mirror the relevant production indexes so the test reflects today's
    // catalogue indexing strategy rather than an artificially unindexed table.
    await client.query(
      "CREATE INDEX catalogue_scaling_active ON catalogue_scaling_products (is_active)"
    );
    await client.query(
      "CREATE INDEX catalogue_scaling_category ON catalogue_scaling_products (category)"
    );
    await client.query(
      "ALTER TABLE catalogue_scaling_products ADD PRIMARY KEY (id)"
    );

    const catalogueSql =
      "SELECT * FROM catalogue_scaling_products " +
      "WHERE is_active = TRUE AND status = 'active' " +
      "ORDER BY is_featured DESC, is_new_arrival DESC, id DESC";

    let previousSize = 0;

    for (const size of sizes) {
      const additional = size - previousSize;

      if (additional > 0) {
        await client.query(
          `INSERT INTO catalogue_scaling_products
            (id, name, description, price, stock, image_url, category, rarity, origin,
             condition, provenance, is_featured, is_new_arrival, is_active, status)
           SELECT
             1000000 + gs,
             '__FLIGALIGA_SCALE_' || gs,
             'Temporary catalogue scaling row',
             1.00,
             10,
             '__fligaliga_scale_' || gs,
             CASE (gs % 4)
               WHEN 0 THEN 'Artifacts'
               WHEN 1 THEN 'Collectibles'
               WHEN 2 THEN 'Oddities'
               ELSE 'Mystery Boxes'
             END,
             CASE (gs % 5)
               WHEN 0 THEN 'Common'
               WHEN 1 THEN 'Uncommon'
               WHEN 2 THEN 'Rare'
               WHEN 3 THEN 'Very Rare'
               ELSE 'Unique'
             END,
             'TEST',
             'TEST',
             'TEST',
             (gs % 10 = 0),
             (gs % 7 = 0),
             TRUE,
             'active'
           FROM generate_series($1, $2) AS gs`,
          [previousSize + 1, size]
        );

        await client.query("ANALYZE catalogue_scaling_products");
      }

      const explain = await client.query(
        "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + catalogueSql
      );
      const plan = explain.rows[0]["QUERY PLAN"][0];

      const benchmarkResult = await benchmark(client, catalogueSql, 10);

      console.log("");
      console.log("Catalogue size:", size);
      console.log(
        "  Plan:",
        plan.Plan["Node Type"],
        plan.Plan.Plans?.[0]?.["Node Type"]
          ? "→ " + plan.Plan.Plans[0]["Node Type"]
          : ""
      );
      console.log(
        "  EXPLAIN execution:",
        Number(plan["Execution Time"]).toFixed(2) + "ms"
      );
      console.log(
        "  Query x10:",
        "p50=" + benchmarkResult.p50.toFixed(2) + "ms",
        "p95=" + benchmarkResult.p95.toFixed(2) + "ms",
        "p99=" + benchmarkResult.p99.toFixed(2) + "ms",
        "max=" + benchmarkResult.max.toFixed(2) + "ms"
      );

      previousSize = size;
    }

    console.log("");
    console.log("5) Current production index coverage");
    const indexInfo = await client.query(
      "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'products' ORDER BY indexname"
    );
    for (const row of indexInfo.rows) {
      console.log("  " + row.indexname + " :: " + row.indexdef);
    }

    await client.query("ROLLBACK");
    console.log("");
    console.log("DONE — temporary scaling table rolled back; public.products was untouched.");
  } finally {
    client.release();
  }
}

main()
  .catch(err => {
    console.error("CATALOGUE SCALING TEST FAILED:", err.stack || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
