const assert=require("node:assert/strict");
const fs=require("node:fs");

const script=fs.readFileSync("public/script.js","utf8");
const server=fs.readFileSync("server.js","utf8");

assert.match(script,/trackEcommerceEvent\('view_item'/);
assert.match(script,/trackEcommerceEvent\('add_to_cart'/);
assert.match(script,/trackEcommerceEvent\('begin_checkout'/);
assert.match(script,/trackEcommerceEvent\('purchase'/);
assert.match(script,/transaction_id:String\(order\.id\)/);
assert.match(script,/currency:STORE_CURRENCY/);
assert.match(script,/items:cartEcommerceItems\(items\)/);
assert.match(script,/fligaliga-purchase-sent-/);
assert.match(script,/order\.status==='paid'/);
assert.match(server,/app\.get\("\/api\/orders\/:id\/items", requireLogin/);
assert.match(server,/WHERE oi\.order_id = \$1 AND o\.user_id = \$2/);
assert.match(server,/p\.name, p\.category/);
assert.match(server,/p\.category, p\.image_url/);

console.log("GA4 ecommerce regression tests passed.");
