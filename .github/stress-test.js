const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const { promisify } = require("util");

const repo = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fligaliga-stress-"));
fs.copyFileSync(path.join(repo, "server.js"), path.join(tmp, "server.js"));
fs.copyFileSync(path.join(repo, "session-store.js"), path.join(tmp, "session-store.js"));
fs.copyFileSync(path.join(repo, "db.js"), path.join(tmp, "real-db.js"));
fs.cpSync(path.join(repo, "public"), path.join(tmp, "public"), { recursive: true });
fs.writeFileSync(path.join(tmp, "db.js"), "module.exports = require('./test-db');\n");
fs.copyFileSync(path.join(__dirname, "test-db.js"), path.join(tmp, "test-db.js"));

const PORT = 31741;
const env = {
  ...process.env,
  NODE_ENV: "test",
  PORT: String(PORT),
  TEST_DB_FAIL: "0",
  NODE_PATH: path.join(repo, "node_modules")
};

function waitForServer(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const req = http.get(url, res => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - start > timeoutMs) reject(new Error("Server did not start"));
        else setTimeout(tick, 100);
      });
    };
    tick();
  });
}

async function startServer(extraEnv = {}) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: tmp,
    env: { ...env, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let logs = "";
  child.stdout.on("data", d => { logs += d.toString(); });
  child.stderr.on("data", d => { logs += d.toString(); });
  await waitForServer("http://127.0.0.1:" + PORT);
  return { child, logs };
}

async function req(pathname, options = {}) {
  return fetch("http://127.0.0.1:" + PORT + pathname, {
    ...options,
    headers: { ...(options.headers || {}) }
  });
}

async function rawReq(pathname, { method = "GET", headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : (typeof body === "string" ? body : JSON.stringify(body));
    const req = http.request({
      hostname: "127.0.0.1",
      port: PORT,
      path: pathname,
      method,
      headers: {
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        ...headers
      }
    }, res => {
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString()
      }));
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function getCookie(pathname, body) {
  const res = await req(pathname, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const cookie = res.headers.get("set-cookie")?.split(";")[0] || "";
  return { res, cookie };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run() {
  const server = await startServer();
  const results = [];
  try {
    let r = await req("/api/health");
    assert(r.status === 200, "health endpoint failed");
    results.push("PASS health");

    r = await req("/");
    assert(r.status === 200, "homepage failed");
    results.push("PASS static homepage");

    r = await req("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "nobody", password: "wrong" })
    });
    assert(r.status === 401, "invalid login should be rejected");
    results.push("PASS invalid login");


    const crossOrigin = await rawReq("/api/logout", {
      method: "POST",
      headers: {
        "Origin": "https://evil.example",
        "Content-Type": "application/json"
      },
      body: {}
    });
    assert(crossOrigin.status === 403, "cross-origin state change was not blocked");
    results.push("PASS cross-origin mutation blocked");

    const loginAdmin = await getCookie("/api/login", { username: "test-admin", password: "AdminPassword123!" });
    assert(loginAdmin.res.status === 204 && loginAdmin.cookie, "admin login failed in harness: HTTP " + loginAdmin.res.status + " " + (await loginAdmin.res.text()));

    r = await req("/api/admin/products", { headers: { Cookie: loginAdmin.cookie } });
    assert(r.status === 200, "admin product list unavailable");
    results.push("PASS admin access");

    r = await req("/api/admin/product/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: loginAdmin.cookie, Origin: "http://127.0.0.1:" + PORT },
      body: JSON.stringify({
        name: "COMPASS UPDATED", description: "updated", price: 19.99, stock: 41,
        image_url: "/assets/compass.png", category: "Collectibles", rarity: "Very Rare",
        origin: "North Sea", condition: "Pristine", provenance: "Updated provenance",
        is_featured: true, is_new_arrival: false
      })
    });
    assert(r.status === 200, "admin product edit failed");
    results.push("PASS admin product edit");

    r = await req("/api/products");
    const products = await r.json();
    assert(products.some(p => p.id === 1 && p.name === "COMPASS UPDATED"), "cache was not invalidated after product edit");
    results.push("PASS product cache invalidation");

    r = await req("/api/admin/product/1", {
      method: "DELETE",
      headers: { Cookie: loginAdmin.cookie, Origin: "http://127.0.0.1:" + PORT }
    });
    assert(r.status === 200, "admin archive failed");
    r = await req("/api/products");
    const afterArchive = await r.json();
    assert(!afterArchive.some(p => p.id === 1), "archived product remained public");
    results.push("PASS product archive preserves public catalogue integrity");

    const loginUser = await getCookie("/api/login", { username: "test-user", password: "CustomerPassword123!" });
    assert(loginUser.res.status === 204 && loginUser.cookie, "customer login failed");
    r = await req("/api/admin/products", { headers: { Cookie: loginUser.cookie } });
    assert(r.status === 403, "normal customer reached admin endpoint");
    results.push("PASS customer denied admin access");

    r = await req("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "x".repeat(100000), password: "x" })
    });
    assert([400, 413, 429].includes(r.status), "oversized request was not safely rejected");
    results.push("PASS oversized request bounded");

    for (let i = 0; i < 11; i++) {
      await req("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "nobody", password: "wrong" })
      });
    }
    r = await req("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "nobody", password: "wrong" })
    });
    assert(r.status === 429, "login limiter did not trigger");
    results.push("PASS login flood throttled");

    const distributedStart = Date.now();
    const distributed = await Promise.all(Array.from({ length: 1000 }, (_, i) => rawReq("/api/products", {
      headers: { "X-Forwarded-For": "198.51.100." + ((i % 250) + 1) + ", 10.0.0." + ((i % 250) + 1) }
    })));
    const distributedMs = Date.now() - distributedStart;
    const distributedOk = distributed.filter(x => x.status === 200).length;
    results.push("INFO distributed-IP simulation: " + distributedOk + "/1000 served in " + distributedMs + "ms");
    assert(distributedOk > 0, "distributed traffic was completely unavailable");

    const floodStartTime = Date.now();
    const productFlood = await Promise.all(Array.from({ length: 500 }, () => req("/api/products")));
    const floodMs = Date.now() - floodStartTime;
    const okCount = productFlood.filter(x => x.status === 200).length;
    const limitedCount = productFlood.filter(x => x.status === 429).length;
    assert(limitedCount > 0, "global API flood limiter did not trigger");
    assert(okCount > 0, "catalogue became completely unavailable under flood");
    results.push("PASS 500-request API flood survived (" + okCount + " served, " + limitedCount + " throttled, " + floodMs + "ms)");


    server.child.kill("SIGTERM");
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("server did not shut down cleanly")), 5000);
      server.child.on("exit", () => { clearTimeout(timer); resolve(); });
    });
    results.push("PASS graceful shutdown");

    const degraded = await startServer({ TEST_DB_FAIL: "1" });
    try {
      r = await req("/api/health");
      assert(r.status === 503, "database outage did not produce a 503 health response");
      r = await req("/");
      assert(r.status === 200, "static homepage became unavailable during database outage");
      results.push("PASS database outage handled without taking down static site");
      degraded.child.kill("SIGTERM");
      await new Promise(resolve => degraded.child.on("exit", resolve));
    } finally {
      if (!degraded.child.killed) degraded.child.kill("SIGTERM");
    }

    console.log(results.join("\n"));
    console.log("\nALL TESTS PASSED");
  } finally {
    if (!server.child.killed) server.child.kill("SIGTERM");
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

run().catch(err => {
  console.error("TEST FAILURE:", err.stack || err);
  process.exitCode = 1;
});
