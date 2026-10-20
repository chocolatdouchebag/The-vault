"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");
const mysql = require("mysql2/promise");

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function reserveEphemeralPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function readJson(response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : null; } catch { return { raw: text }; }
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise(resolve => child.once("exit", resolve));
  child.kill("SIGTERM");
  const result = await Promise.race([exited.then(() => "exited"), delay(5000).then(() => "timeout")]);
  if (result === "timeout" && child.exitCode === null) child.kill("SIGKILL");
}

async function main() {
  const mysqlConnection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Math.max(1, Math.min(65535, Number(process.env.MYSQL_PORT) || 3306)),
    database: process.env.MYSQL_DATABASE,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD || "",
    connectTimeout: 10000,
    charset: "utf8mb4",
    timezone: "Z",
    ssl: process.env.MYSQL_SSL === "true"
      ? { rejectUnauthorized: process.env.MYSQL_SSL_REJECT_UNAUTHORIZED !== "false" }
      : undefined
  });

  let child = null;
  let productId = null;
  let orderId = null;
  let username = "checkout-migration-" + process.pid + "-" + Date.now();
  let appLogs = "";
  const password = "MyCheckoutTestPassword!2026";
  const port = await reserveEphemeralPort();
  const baseUrl = "http://127.0.0.1:" + port;

  try {
    const [categories] = await mysqlConnection.query(
      "SELECT id FROM categories WHERE slug = ? LIMIT 1",
      ["test-category"]
    );
    assert.ok(categories.length, "schema regression setup should provide the test-category row");

    const [productInsert] = await mysqlConnection.query(
      "INSERT INTO products (name, description, price, stock, category_id, status, fulfillment_method, is_active) " +
      "VALUES (?, ?, ?, ?, ?, 'active', 'stock', 1)",
      ["Synthetic checkout route product", "Synthetic test fixture", "19.99", 7, categories[0].id]
    );
    productId = productInsert.insertId;

    const preloadPath = path.join(__dirname, "mock-mollie-fetch.js");
    const existingNodeOptions = String(process.env.NODE_OPTIONS || "").trim();
    const childEnv = {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "test",
      PAYMENTS_ENABLED: "true",
      MOLLIE_API_KEY: "test-only-mollie-token",
      PUBLIC_BASE_URL: "https://fligaliga.invalid",
      SESSION_SECRET: "synthetic-checkout-test-session-secret-2026",
      RESEND_API_KEY: "",
      RESEND_FROM: "",
      CONTACT_RECIPIENT: "",
      NODE_OPTIONS: [existingNodeOptions, "--require=" + preloadPath].filter(Boolean).join(" ")
    };

    child = spawn(process.execPath, ["server.js"], {
      cwd: path.join(__dirname, ".."),
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"]
    });
    child.stdout.on("data", data => { appLogs += data.toString(); });
    child.stderr.on("data", data => { appLogs += data.toString(); });

    let healthy = false;
    let earlyExit = null;
    child.once("exit", (code, signal) => {
      earlyExit = { code, signal };
    });

    for (let attempt = 0; attempt < 100; attempt++) {
      if (earlyExit) break;
      try {
        const response = await fetch(baseUrl + "/api/health", { signal: AbortSignal.timeout(1000) });
        if (response.status === 200) {
          const body = await readJson(response);
          if (body?.ok === true) {
            healthy = true;
            break;
          }
        }
      } catch {}
      await delay(100);
    }
    assert.ok(healthy, "application did not become healthy; child exit=" +
      JSON.stringify(earlyExit) + "; logs=" + appLogs.slice(-3000));

    const registerResponse = await fetch(baseUrl + "/api/register", {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseUrl },
      body: JSON.stringify({ username, password })
    });
    assert.equal(registerResponse.status, 200, "test user registration should work");

    const loginResponse = await fetch(baseUrl + "/api/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseUrl },
      body: JSON.stringify({ username, password })
    });
    assert.equal(loginResponse.status, 204, "test user login should work");
    const setCookie = loginResponse.headers.get("set-cookie");
    assert.ok(setCookie, "login should set an Express session cookie");
    const cookie = setCookie.split(";")[0];

    const cartResponse = await fetch(baseUrl + "/api/cart", {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseUrl, cookie },
      body: JSON.stringify({ product_id: productId })
    });
    assert.equal(cartResponse.status, 200, "authenticated cart add should work");

    const checkoutResponse = await fetch(baseUrl + "/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseUrl, cookie },
      body: JSON.stringify({
        customer_name: "Synthetic Checkout Buyer",
        customer_email: "checkout-test@example.test",
        shipping_address_line1: "1 Test Lane",
        shipping_postcode: "1234 AB",
        shipping_city: "Test City",
        shipping_country: "NL",
        accept_terms: true
      })
    });
    const checkout = await readJson(checkoutResponse);
    assert.equal(
      checkoutResponse.status,
      200,
      "checkout should create a synthetic Mollie payment; response=" +
        JSON.stringify(checkout) + "; logs=" + appLogs.slice(-3000)
    );
    assert.equal(checkout?.success, true);
    assert.ok(checkout.orderId);
    assert.equal(checkout.checkoutUrl, "https://checkout.invalid/tr_mysql_migration_checkout_test");
    orderId = checkout.orderId;

    const [reservedRows] = await mysqlConnection.query(
      "SELECT status, payment_id, payment_expires_at FROM orders WHERE id = ?",
      [orderId]
    );
    assert.equal(reservedRows[0]?.status, "payment_pending");
    assert.equal(reservedRows[0]?.payment_id, "tr_mysql_migration_checkout_test");
    assert.ok(reservedRows[0]?.payment_expires_at);

    const [reservedStock] = await mysqlConnection.query("SELECT stock FROM products WHERE id = ?", [productId]);
    assert.equal(Number(reservedStock[0]?.stock), 6, "checkout should reserve one unit of stock");

    const webhookResponse = await fetch(baseUrl + "/api/payments/mollie-webhook", {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseUrl },
      body: JSON.stringify({ id: "tr_mysql_migration_checkout_test" })
    });
    assert.equal(webhookResponse.status, 200, "failed-payment webhook should be acknowledged");

    const [finalOrders] = await mysqlConnection.query(
      "SELECT status, stock_released_at FROM orders WHERE id = ?",
      [orderId]
    );
    assert.equal(finalOrders[0]?.status, "payment_failed", "webhook should persist the failed payment status");
    assert.ok(finalOrders[0]?.stock_released_at, "webhook should mark reserved stock as released");

    const [restoredStock] = await mysqlConnection.query("SELECT stock FROM products WHERE id = ?", [productId]);
    assert.equal(Number(restoredStock[0]?.stock), 7, "failed-payment webhook should restore reserved stock");

    const duplicateWebhook = await fetch(baseUrl + "/api/payments/mollie-webhook", {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseUrl },
      body: JSON.stringify({ id: "tr_mysql_migration_checkout_test" })
    });
    assert.equal(duplicateWebhook.status, 200, "duplicate webhook should remain safely acknowledged");
    const [afterRetryStock] = await mysqlConnection.query("SELECT stock FROM products WHERE id = ?", [productId]);
    assert.equal(Number(afterRetryStock[0]?.stock), 7, "duplicate webhook must not restore stock twice");

    console.log("Synthetic checkout, mocked Mollie webhook and stock rollback integration checks passed.");
  } finally {
    await stopChild(child);
    if (orderId !== null) {
      await mysqlConnection.query("DELETE FROM order_items WHERE order_id = ?", [orderId]).catch(() => {});
      await mysqlConnection.query("DELETE FROM orders WHERE id = ?", [orderId]).catch(() => {});
    }
    if (username) {
      const [users] = await mysqlConnection.query("SELECT id FROM users WHERE username = ?", [username]).catch(() => [[]]);
      if (users[0]) {
        await mysqlConnection.query("DELETE FROM cart WHERE user_id = ?", [users[0].id]).catch(() => {});
        await mysqlConnection.query("DELETE FROM users WHERE id = ?", [users[0].id]).catch(() => {});
      }
    }
    if (productId !== null) {
      await mysqlConnection.query("DELETE FROM products WHERE id = ?", [productId]).catch(() => {});
    }
    await mysqlConnection.end();
  }
}

main().catch(error => {
  console.error("Synthetic checkout integration test failed:", error.message || "unknown error");
  process.exitCode = 1;
});
