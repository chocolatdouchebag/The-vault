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
assert.match(index, /data-i18n="cookieNoticeText"/);
assert.match(script, /function initCookieNotice\(\)/);
assert.match(script, /fligaliga-cookie-notice-seen/);
assert.match(script, /localStorage\.setItem\(key,'1'\)/);
assert.match(style, /\.cookie-notice/);
assert.match(style, /:root\[data-theme="light"\] \.cookie-notice/);



assert.match(script, /const CONSENT_VERSION='1'/);
assert.match(script, /function readConsent\(\)/);
assert.match(script, /function loadGoogleAnalytics\(\)/);
assert.match(script, /analytics_storage:'denied'/);
assert.match(script, /ad_storage:'denied'/);
assert.match(script, /ad_user_data:'denied'/);
assert.match(script, /ad_personalization:'denied'/);
assert.match(script, /googletagmanager\.com\/gtag\/js/);
assert.match(script, /fligaliga-consent-v/);
assert.match(script, /function deleteAnalyticsCookies\(\)/);
assert.match(script, /function openCookieSettings\(\)/);
assert.doesNotMatch(index, /googletagmanager\.com\/gtag\/js/);
assert.match(index, /id="cookie-notice-accept"/);
assert.match(index, /id="cookie-notice-reject"/);
assert.match(index, /id="cookie-settings-fab"/);
assert.match(index, /id="cookie-analytics-toggle"/);
assert.match(server, /GA_MEASUREMENT_ID/);
assert.match(server, /analyticsMeasurementId/);
assert.match(server, /www\.google-analytics\.com/);

console.log("Robots, sitemap and cookie-notice regression tests passed.");
