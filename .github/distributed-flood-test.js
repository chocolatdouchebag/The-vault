const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const repo = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fligaliga-distributed-"));
for (const file of ["server.js", "session-store.js", "payment-cleanup.js"]) fs.copyFileSync(path.join(repo, file), path.join(tmp, file));
fs.cpSync(path.join(repo, "public"), path.join(tmp, "public"), { recursive: true });
fs.writeFileSync(path.join(tmp, "db.js"), "module.exports = require('./test-db');\n");
fs.copyFileSync(path.join(__dirname, "test-db.js"), path.join(tmp, "test-db.js"));

const PORT = 31742;
const child = spawn(process.execPath, ["server.js"], {
  cwd: tmp,
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(PORT),
    SESSION_SECRET: "isolated-test-secret",
    PUBLIC_BASE_URL: "https://example.test",
    PAYMENTS_ENABLED: "false",
    NODE_PATH: path.join(repo, "node_modules")
  },
  stdio: ["ignore", "pipe", "pipe"]
});

function req(ip) {
  return new Promise((resolve, reject) => {
    const r = http.request({
      hostname: "127.0.0.1",
      port: PORT,
      path: "/api/products",
      method: "GET",
      headers: { "X-Forwarded-For": ip }
    }, res => {
      res.resume();
      res.on("end", () => resolve(res.statusCode));
    });
    r.on("error", reject);
    r.end();
  });
}

function waitForServer() {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const poll = () => {
      req("198.18.0.1").then(() => resolve()).catch(() => {
        if (Date.now() - start > 10000) reject(new Error("server did not start"));
        else setTimeout(poll, 100);
      });
    };
    poll();
  });
}

(async () => {
  try {
    await waitForServer();
    const start = Date.now();
    const statuses = await Promise.all(
      Array.from({ length: 1000 }, (_, i) => req("198.51.100." + (i + 1)))
    );
    const ms = Date.now() - start;
    const ok = statuses.filter(s => s === 200).length;
    const limited = statuses.filter(s => s === 429).length;
    console.log("1000 distinct-IP requests:", ok, "HTTP 200,", limited, "HTTP 429,", ms + "ms");
    if (ok < 900) throw new Error("unexpectedly high rejection rate");
    console.log("RESULT: distributed traffic is not meaningfully stopped by per-IP limiting alone.");
    console.log("This is expected for an app-level per-IP limiter and is a reason to use a reverse-proxy/WAF/global edge limit before production growth.");
  } catch (err) {
    console.error("TEST FAILURE:", err.stack || err);
    process.exitCode = 1;
  } finally {
    child.kill("SIGTERM");
    await new Promise(resolve => child.on("exit", resolve));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})();
