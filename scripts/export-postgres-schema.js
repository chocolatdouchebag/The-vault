#!/usr/bin/env node
"use strict";

// Export PostgreSQL DDL only. This never exports table rows and never prints credentials.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
require("dotenv").config({ quiet: true });

function setFromUrl(env, rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL.");
  }

  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("DATABASE_URL must use postgres:// or postgresql:// for this export.");
  }

  env.PGHOST ||= decodeURIComponent(url.hostname);
  env.PGPORT ||= url.port || "5432";
  env.PGUSER ||= decodeURIComponent(url.username);
  env.PGDATABASE ||= decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!env.PGPASSWORD && url.password) env.PGPASSWORD = decodeURIComponent(url.password);

  const sslmode = url.searchParams.get("sslmode");
  if (sslmode && !env.PGSSLMODE) env.PGSSLMODE = sslmode;
}

function main() {
  const childEnv = { ...process.env };

  if (childEnv.DATABASE_URL) {
    setFromUrl(childEnv, childEnv.DATABASE_URL);
  } else {
    childEnv.PGHOST ||= childEnv.DB_HOST;
    childEnv.PGPORT ||= childEnv.DB_PORT || "5432";
    childEnv.PGUSER ||= childEnv.DB_USER;
    childEnv.PGDATABASE ||= childEnv.DB_NAME;
    if (!childEnv.PGPASSWORD && childEnv.DB_PASS) childEnv.PGPASSWORD = childEnv.DB_PASS;
  }

  const missing = ["PGHOST", "PGUSER", "PGDATABASE"].filter(key => !childEnv[key]);
  if (missing.length) {
    console.error("Missing PostgreSQL connection settings. Check DB_HOST, DB_USER, DB_NAME or DATABASE_URL in your local .env.");
    process.exitCode = 1;
    return;
  }

  const outputPath = process.env.SCHEMA_EXPORT_PATH ||
    path.join(os.tmpdir(), "fligaliga-postgres-schema.sql");

  const args = [
    "--schema-only",
    "--no-owner",
    "--no-privileges",
    "--no-comments",
    "--host", childEnv.PGHOST,
    "--port", childEnv.PGPORT || "5432",
    "--username", childEnv.PGUSER,
    "--dbname", childEnv.PGDATABASE
  ];

  const result = spawnSync("pg_dump", args, {
    env: childEnv,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024
  });

  if (result.error) {
    if (result.error.code === "ENOENT") {
      console.error("pg_dump was not found. Install PostgreSQL client tools, then rerun npm run db:export-postgres-schema.");
    } else {
      console.error("Could not run pg_dump. Check the local PostgreSQL client installation.");
    }
    process.exitCode = 1;
    return;
  }

  if (result.status !== 0) {
    // Do not print pg_dump stderr verbatim: connection diagnostics can contain sensitive host details.
    console.error("pg_dump failed. Check that the database is reachable and the configured user can read its schema.");
    process.exitCode = 1;
    return;
  }

  fs.writeFileSync(outputPath, result.stdout, { encoding: "utf8", mode: 0o600 });

  const tableNames = [...result.stdout.matchAll(/CREATE TABLE (?:ONLY )?(?:(?:"?[^".]+"?)\.)?"?([A-Za-z_][A-Za-z0-9_]*)"?\s*\(/g)]
    .map(match => match[1]);
  console.log("Schema-only export created:", outputPath);
  console.log("Bytes written:", Buffer.byteLength(result.stdout, "utf8"));
  console.log("Tables found:", tableNames.length ? [...new Set(tableNames)].sort().join(", ") : "(no CREATE TABLE statements detected)");
  console.log("No customer or order rows were exported. Keep the file out of Git.");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Schema export failed.");
  process.exitCode = 1;
}
