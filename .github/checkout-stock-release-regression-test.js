"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const cleanup = fs.readFileSync(path.join(__dirname, "..", "payment-cleanup.js"), "utf8");

assert.match(
  cleanup,
  /async function releaseReservedStock\s*\(\s*pool\s*,\s*orderId\s*,/
);

const calls = [...server.matchAll(/releaseReservedStock\s*\(([^)]*)\)/gs)];
assert.ok(calls.length >= 5, "expected checkout and payment-webhook stock-release call sites");

for (const [index, match] of calls.entries()) {
  const args = match[1].trim();
  assert.match(
    args,
    /^pool\s*,/,
    "releaseReservedStock call " + (index + 1) + " must pass the database pool as argument one"
  );
}

console.log("Checkout/payment stock-release call-site regression checks passed (" + calls.length + " call sites).");
