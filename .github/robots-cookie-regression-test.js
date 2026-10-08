"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const robots = fs.readFileSync(path.join(root, "public", "robots.txt"), "utf8");
const index = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
const style = fs.readFileSync(path.join(root, "public", "style.css"), "utf8");
const script = fs.readFileSync(path.join(root, "public", "script.js"), "utf8");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");

assert.match(robots, /^User-agent: \*$/m);
assert.match(robots, /^Allow: \/$/m);
assert.match(robots, /^Disallow: \/api\/$/m);
assert.match(robots, /^Disallow: \/admin$/m);
assert.match(robots, /^Disallow: \/payment-result$/m);
assert.match(robots, /^Sitemap: https:\/\/fligaliga\.nl\/sitemap\.xml$/m);

assert.match(server, /app\.get\(["']\/sitemap\.xml["']/);
assert.match(server, /"\/withdrawal-form\.html"/);
assert.match(server, /"\/accessibility"/);
assert.doesNotMatch(server, /urls\.push\(["']\/payment-result["']\)/);

assert.match(index, /id="cookie-notice"/);
assert.match(index, /id="cookie-notice-dismiss"/);
assert.match(index, /data-i18n="cookieNoticeText"/);
assert.match(script, /function initCookieNotice\(\)/);
assert.match(script, /fligaliga-cookie-notice-seen/);
assert.match(script, /localStorage\.setItem\(key,'1'\)/);
assert.match(style, /\.cookie-notice/);
assert.match(style, /:root\[data-theme="light"\] \.cookie-notice/);

console.log("Robots, sitemap and cookie-notice regression tests passed.");
