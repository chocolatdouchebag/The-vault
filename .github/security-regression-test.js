const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const repo = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fligaliga-security-"));
for (const file of ["server.js", "session-store.js"]) fs.copyFileSync(path.join(repo, file), path.join(tmp, file));
fs.cpSync(path.join(repo, "public"), path.join(tmp, "public"), { recursive: true });
fs.writeFileSync(path.join(tmp, "db.js"), "module.exports = require('./test-db');\n");
fs.copyFileSync(path.join(__dirname, "test-db.js"), path.join(tmp, "test-db.js"));

const PORT = 31743;
const child = spawn(process.execPath, ["server.js"], {
  cwd: tmp,
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(PORT),
    SESSION_SECRET: "isolated-security-test-secret",
    PUBLIC_BASE_URL: "https://example.test",
    PAYMENTS_ENABLED: "false",
    NODE_PATH: path.join(repo, "node_modules")
  },
  stdio: ["ignore", "pipe", "pipe"]
});

function request(pathname, { method = "GET", headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : (typeof body === "string" ? body : JSON.stringify(body));
    const req = http.request({
      hostname: "127.0.0.1",
      port: PORT,
      path: pathname,
      method,
      headers: { ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}), ...headers }
    }, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
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

async function waitForServer() {
  const start = Date.now();
  while (Date.now() - start < 10000) {
    try { await request("/api/health"); return; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error("server did not start");
}
function assert(ok, message) { if (!ok) throw new Error(message); }

(async () => {
  try {
    await waitForServer();

    let r = await request("/api/health");
    assert(r.status === 200, "health failed");
    assert(r.headers["x-powered-by"] === undefined, "X-Powered-By exposed");
    assert(String(r.headers["content-security-policy"] || "").includes("frame-ancestors 'none'"), "CSP missing");
    assert(r.headers["x-content-type-options"] === "nosniff", "nosniff missing");
    assert(r.headers["referrer-policy"] === "strict-origin-when-cross-origin", "Referrer-Policy missing");
    assert(String(r.headers["permissions-policy"] || "").includes("geolocation=()"), "Permissions-Policy missing");
    assert(String(r.headers["strict-transport-security"] || "").includes("max-age=31536000"), "HSTS missing");
    console.log("PASS production security headers");

    r = await request("/api/products/%2E%2E%2Fetc%2Fpasswd");
    assert(r.status === 404, "encoded traversal reached a product");
    console.log("PASS encoded traversal rejected");

    r = await request("/api/products/not-a-real-product");
    assert(r.status === 404, "unknown product did not return 404");
    console.log("PASS unknown product handled");

    r = await request("/api/products/999999999999999999999999");
    assert(r.status === 404, "oversized product ID did not return 404");
    console.log("PASS oversized product ID handled");

    r = await request("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json"
    });
    assert(r.status === 400, "malformed JSON was not rejected");
    console.log("PASS malformed JSON rejected");

    r = await request("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "' OR 1=1 --", password: "' OR 1=1 --" })
    });
    assert(r.status === 401, "injection-shaped login was accepted");
    console.log("PASS injection-shaped login rejected");

    const admin = await request("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https" },
      body: JSON.stringify({ username: "test-admin", password: "AdminPassword123!" })
    });
    const cookieHeader = admin.headers["set-cookie"]?.[0] || "";
    const cookie = cookieHeader.split(";")[0];
    assert(admin.status === 204 && cookie, "admin login failed");
    assert(cookieHeader.includes("__Host-fligaliga="), "production cookie name incorrect");
    assert(cookieHeader.includes("HttpOnly"), "cookie not HttpOnly");
    assert(cookieHeader.includes("Secure"), "cookie not Secure");
    assert(cookieHeader.includes("SameSite=Lax"), "cookie SameSite missing");
    console.log("PASS production session cookie flags");

    r = await request("/api/admin/product/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie, Origin: "https://example.test" },
      body: {
        name: "Safe", description: "Safe", price: 10, stock: 1, image_url: "",
        category: "<script>alert(1)</script>", rarity: "Rare", origin: "x",
        condition: "x", provenance: "x", is_featured: false, is_new_arrival: false
      }
    });
    assert(r.status === 400, "invalid category accepted");
    console.log("PASS admin category validation");

    r = await request("/api/admin/product/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie, Origin: "https://example.test" },
      body: {
        name: "Safe", description: "Safe", price: "Infinity", stock: 1, image_url: "",
        category: "Artifacts", rarity: "Rare", origin: "x", condition: "x",
        provenance: "x", is_featured: false, is_new_arrival: false
      }
    });
    assert(r.status === 400, "non-finite price accepted");
    console.log("PASS numeric validation");

    r = await request("/api/admin/product/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie, Origin: "https://evil.example" },
      body: {
        name: "Safe", description: "Safe", price: 10, stock: 1, image_url: "",
        category: "Artifacts", rarity: "Rare", origin: "x", condition: "x",
        provenance: "x", is_featured: false, is_new_arrival: false
      }
    });
    assert(r.status === 403, "cross-origin admin mutation accepted");
    console.log("PASS admin CSRF-origin protection");

    const source = fs.readFileSync(path.join(repo, "public", "script.js"), "utf8");
    assert(source.includes("function escapeHtml"), "escapeHtml helper missing");
    assert(source.includes("escapeHtml(p.name)"), "product name is not escaped");
    assert(source.includes("escapeHtml(p.description"), "product description is not escaped");
    assert(source.includes("escapeAttr(src)"), "image source escaping regression");
    console.log("PASS browser escaping regression checks");

    child.kill("SIGTERM");
    await new Promise(resolve => child.on("exit", resolve));
    console.log("ALL SECURITY REGRESSION TESTS PASSED");
  } catch (err) {
    console.error("TEST FAILURE:", err.stack || err);
    process.exitCode = 1;
    child.kill("SIGTERM");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})();