const express = require("express");
const session = require("express-session");
const PgSessionStore = require("./session-store");
const bcrypt = require("bcrypt");
const bodyParser = require("body-parser");
const path = require("path");
const pool = require("./db");
require("dotenv").config();

const DUMMY_PASSWORD_HASH = bcrypt.hashSync("fligaliga-invalid-password", 10);

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, "public");
const isProduction = process.env.NODE_ENV === "production";
if (isProduction && !process.env.SESSION_SECRET) throw new Error("SESSION_SECRET must be set in production");
app.disable("x-powered-by");
if (isProduction) app.set("trust proxy", 1);

function createRateLimiter({ windowMs, maxRequests, key = req => req.ip || "unknown" }) {
  const buckets = new Map();
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [id, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(id);
    }
  }, Math.min(windowMs, 60000));
  cleanup.unref?.();

  return (req, res, next) => {
    const now = Date.now();
    const id = String(key(req) || "unknown");
    let bucket = buckets.get(id);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(id, bucket);
    }

    bucket.count += 1;
    if (bucket.count > maxRequests) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({ error: "Too many requests. Please try again later." });
    }

    next();
  };
}

const apiRateLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 240 });
const loginRateLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 12 });
const registerRateLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, maxRequests: 8 });
const withdrawalRateLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, maxRequests: 10 });

app.use("/api", apiRateLimiter);
app.use(bodyParser.json({ limit: "64kb" }));
app.use(express.urlencoded({ extended: false, limit: "32kb" }));
app.use(session({
  store: new PgSessionStore(pool),
  name: isProduction ? "__Host-fligaliga" : "fligaliga.sid",
  secret: process.env.SESSION_SECRET || "fligaliga-development-secret-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: isProduction, path: "/", maxAge: 1000 * 60 * 60 * 24 * 7 }
}));

app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; " +
    "img-src 'self' data: blob: http: https:; " +
    "script-src 'self'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "connect-src 'self'; " +
    "base-uri 'self'; form-action 'self'; frame-ancestors 'none';"
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (isProduction) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});

function requireSameOrigin(req, res, next) {
  const origin = req.get("Origin");
  const configuredBaseUrl = String(process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
  let expectedOrigin;
  try {
    expectedOrigin = configuredBaseUrl ? new URL(configuredBaseUrl).origin : `${req.protocol}://${req.get("host")}`;
  } catch {
    expectedOrigin = `${req.protocol}://${req.get("host")}`;
  }

  if (origin && origin !== expectedOrigin) return res.status(403).json({ error: "Cross-site request blocked" });

  const referer = req.get("Referer");
  if (!origin && referer) {
    try {
      if (new URL(referer).origin !== expectedOrigin) return res.status(403).json({ error: "Cross-site request blocked" });
    } catch {
      return res.status(403).json({ error: "Invalid request origin" });
    }
  }

  next();
}

function requireLogin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Login required" });
  next();
}
async function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Login required" });
  try {
    const result = await pool.query("SELECT is_admin FROM users WHERE id = $1", [req.session.userId]);
    if (!result.rows[0]?.is_admin) return res.status(403).json({ error: "Admin only" });
    req.session.isAdmin = true;
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Admin check failed" });
  }
}

function productSlug(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

app.post("/api/register", registerRateLimiter, async (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  if (username.length < 3 || username.length > 64) return res.status(400).json({ error: "Username must be 3 to 64 characters" });
  if (password.length < 12 || password.length > 128) return res.status(400).json({ error: "Password must be 12 to 128 characters" });
  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query("INSERT INTO users (username, password) VALUES ($1, $2)", [username, hash]);
    res.sendStatus(200);
  } catch (err) {
    if (err?.code === "23505") return res.status(409).json({ error: "User already exists" });
    console.error(err);
    res.status(500).json({ error: "Registration failed" });
  }
});

app.post("/api/login", loginRateLimiter, async (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  try {
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
    const user = result.rows[0] || null;
    const valid = await bcrypt.compare(password, user?.password || DUMMY_PASSWORD_HASH);
    if (!user || !valid) return res.status(401).json({ error: "Invalid login" });
    req.session.regenerate(err => {
      if (err) return res.status(500).json({ error: "Login failed" });
      req.session.userId = user.id;
      req.session.isAdmin = !!user.is_admin;
      req.session.user = { id: user.id, username: user.username, isAdmin: !!user.is_admin };
      req.session.cookie.maxAge = user.is_admin ? 1000 * 60 * 60 * 2 : 1000 * 60 * 60 * 24 * 7;
      res.sendStatus(204);
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Login failed");
  }
});

app.post("/api/logout", (req, res) => req.session.destroy(() => res.sendStatus(200)));
app.get("/api/me", async (req, res) => {
  if (!req.session.userId) return res.json(null);
  try {
    const result = await pool.query("SELECT id, username, is_admin FROM users WHERE id = $1", [req.session.userId]);
    if (!result.rows.length) return res.json(null);
    const user = result.rows[0];
    req.session.isAdmin = !!user.is_admin;
    req.session.user = { id: user.id, username: user.username, isAdmin: !!user.is_admin };
    res.json(req.session.user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load account" });
  }
});
app.get("/api/health", async (req, res) => { try { await pool.query("SELECT 1"); res.json({ ok: true }); } catch (err) { res.status(503).json({ ok: false }); } });

app.get("/api/products", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM products WHERE is_active = TRUE AND status = 'active' ORDER BY is_featured DESC, is_new_arrival DESC, id DESC");
    res.json(result.rows.map(p => ({ ...p, slug: productSlug(p.name) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load products" });
  }
});

app.get("/api/products/:idOrSlug", async (req, res) => {
  const key = req.params.idOrSlug;
  try {
    const idMatch = key.match(/(?:^|-)(\d+)$/);
    let product;
    if (idMatch) {
      const result = await pool.query("SELECT * FROM products WHERE id = $1 AND is_active = TRUE AND status = 'active'", [Number(idMatch[1])]);
      product = result.rows[0];
    } else {
      const result = await pool.query("SELECT * FROM products WHERE is_active = TRUE AND status = 'active'");
      product = result.rows.find(p => productSlug(p.name) === key.toLowerCase());
    }
    if (!product) return res.status(404).json({ error: "Treasure not found" });
    res.json({ ...product, slug: productSlug(product.name) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load treasure" });
  }
});

app.post("/api/admin/product", requireAdmin, async (req, res) => {
  const {
    name, description, price, stock, image_url, category, rarity,
    origin, condition, provenance, is_featured, is_new_arrival
  } = req.body || {};

  const allowedCategories = new Set(["Artifacts", "Collectibles", "Oddities", "Mystery Boxes"]);
  const allowedRarities = new Set(["Common", "Uncommon", "Rare", "Very Rare", "Unique"]);

  const cleanName = String(name || "").trim();
  const cleanDescription = String(description || "").trim();
  const cleanImage = String(image_url || "").trim();
  const cleanCategory = String(category || "").trim();
  const cleanRarity = String(rarity || "").trim();
  const cleanOrigin = String(origin || "").trim();
  const cleanCondition = String(condition || "").trim();
  const cleanProvenance = String(provenance || "").trim();

  const numericPrice = Number(price);
  const numericStock = Number(stock);

  if (!cleanName || cleanName.length > 160) return res.status(400).json({ error: "Enter a valid treasure name" });
  if (cleanDescription.length > 5000) return res.status(400).json({ error: "Description is too long" });
  if (!Number.isFinite(numericPrice) || numericPrice <= 0 || numericPrice > 99999999.99)
    return res.status(400).json({ error: "Enter a valid price" });
  if (!Number.isInteger(numericStock) || numericStock < 0 || numericStock > 2147483647)
    return res.status(400).json({ error: "Enter a valid stock quantity" });
  if (!allowedCategories.has(cleanCategory)) return res.status(400).json({ error: "Select a valid category" });
  if (cleanRarity && !allowedRarities.has(cleanRarity)) return res.status(400).json({ error: "Select a valid rarity" });
  if (cleanImage.length > 1000) return res.status(400).json({ error: "Image URL is too long" });
  if (cleanOrigin.length > 200) return res.status(400).json({ error: "Origin is too long" });
  if (cleanCondition.length > 120) return res.status(400).json({ error: "Condition is too long" });
  if (cleanProvenance.length > 2000) return res.status(400).json({ error: "Provenance is too long" });

  try {
    const result = await pool.query(
      `INSERT INTO products (name, description, price, stock, image_url, category, rarity, origin, condition, provenance, is_featured, is_new_arrival)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        cleanName, cleanDescription, numericPrice, numericStock, cleanImage || null,
        cleanCategory, cleanRarity || null, cleanOrigin || null, cleanCondition || null,
        cleanProvenance || null, is_featured === true, is_new_arrival === true
      ]
    );
    res.status(201).json({ success: true, id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add product" });
  }
});

app.delete("/api/admin/product/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM products WHERE id = $1", [req.params.id]);
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete product" });
  }
});

app.get("/api/admin/products", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM products ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load products" });
  }
});

app.patch("/api/admin/product/:id", requireAdmin, async (req, res) => {
  const productId = Number(req.params.id);
  if (!Number.isInteger(productId) || productId <= 0) return res.status(400).json({ error: "Invalid product" });

  const {
    name, description, price, stock, image_url, category, rarity,
    origin, condition, provenance, is_featured, is_new_arrival
  } = req.body || {};

  const allowedCategories = new Set(["Artifacts", "Collectibles", "Oddities", "Mystery Boxes"]);
  const allowedRarities = new Set(["Common", "Uncommon", "Rare", "Very Rare", "Unique"]);
  const cleanName = String(name || "").trim();
  const cleanDescription = String(description || "").trim();
  const cleanImage = String(image_url || "").trim();
  const cleanCategory = String(category || "").trim();
  const cleanRarity = String(rarity || "").trim();
  const cleanOrigin = String(origin || "").trim();
  const cleanCondition = String(condition || "").trim();
  const cleanProvenance = String(provenance || "").trim();
  const numericPrice = Number(price);
  const numericStock = Number(stock);

  if (!cleanName || cleanName.length > 160) return res.status(400).json({ error: "Enter a valid treasure name" });
  if (cleanDescription.length > 5000) return res.status(400).json({ error: "Description is too long" });
  if (!Number.isFinite(numericPrice) || numericPrice <= 0 || numericPrice > 99999999.99) return res.status(400).json({ error: "Enter a valid price" });
  if (!Number.isInteger(numericStock) || numericStock < 0 || numericStock > 2147483647) return res.status(400).json({ error: "Enter a valid stock quantity" });
  if (!allowedCategories.has(cleanCategory)) return res.status(400).json({ error: "Select a valid category" });
  if (cleanRarity && !allowedRarities.has(cleanRarity)) return res.status(400).json({ error: "Select a valid rarity" });
  if (cleanImage.length > 1000) return res.status(400).json({ error: "Image URL is too long" });
  if (cleanOrigin.length > 200) return res.status(400).json({ error: "Origin is too long" });
  if (cleanCondition.length > 120) return res.status(400).json({ error: "Condition is too long" });
  if (cleanProvenance.length > 2000) return res.status(400).json({ error: "Provenance is too long" });

  try {
    const result = await pool.query(
      `UPDATE products
       SET name = $1, description = $2, price = $3, stock = $4, image_url = $5,
           category = $6, rarity = $7, origin = $8, condition = $9, provenance = $10,
           is_featured = $11, is_new_arrival = $12, updated_at = CURRENT_TIMESTAMP
       WHERE id = $13
       RETURNING *`,
      [
        cleanName, cleanDescription, numericPrice, numericStock, cleanImage || null,
        cleanCategory, cleanRarity || null, cleanOrigin || null, cleanCondition || null,
        cleanProvenance || null, is_featured === true, is_new_arrival === true, productId
      ]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Treasure not found" });
    res.json({ success: true, product: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update product" });
  }
});

app.post("/api/cart", requireLogin, async (req, res) => {
  const productId = Number(req.body?.product_id);
  if (!Number.isInteger(productId) || productId <= 0) return res.status(400).json({ error: "Invalid product" });
  const userId = req.session.userId;
  try {
    const existing = await pool.query(
      `SELECT c.id, c.quantity, p.stock
       FROM cart c
       JOIN products p ON c.product_id = p.id
       WHERE c.user_id = $1 AND c.product_id = $2
         AND p.is_active = TRUE AND p.status = 'active'`,
      [userId, productId]
    );
    if (!existing.rows.length) {
      const product = await pool.query(
        "SELECT stock FROM products WHERE id = $1 AND is_active = TRUE AND status = 'active'",
        [productId]
      );
      if (!product.rows.length) return res.status(404).json({ error: "Treasure not found" });
      if (Number(product.rows[0].stock) < 1) return res.status(409).json({ error: "This treasure is currently out of stock" });
      await pool.query("INSERT INTO cart (user_id, product_id, quantity) VALUES ($1, $2, 1)", [userId, productId]);
    } else {
      const item = existing.rows[0];
      if (Number(item.quantity) >= Number(item.stock)) return res.status(409).json({ error: "You cannot add more than the available stock" });
      await pool.query("UPDATE cart SET quantity = quantity + 1 WHERE id = $1 AND user_id = $2", [item.id, userId]);
    }
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not add to cart" });
  }
});

app.get("/api/cart", requireLogin, async (req, res) => {
  try {
    const cart = await pool.query(`
      SELECT c.id, c.product_id, c.quantity, p.name, p.price, p.image_url
      FROM cart c JOIN products p ON c.product_id = p.id
      WHERE c.user_id = $1 ORDER BY c.id DESC
    `, [req.session.userId]);
    res.json(cart.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load cart" });
  }
});

app.post("/api/cart/update", requireLogin, async (req, res) => {
  const id = Number(req.body?.id), quantity = Number(req.body?.quantity);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(quantity)) return res.status(400).json({ error: "Invalid cart update" });
  try {
    const row = await pool.query("SELECT c.id, p.stock FROM cart c JOIN products p ON c.product_id = p.id WHERE c.id = $1 AND c.user_id = $2 AND p.is_active = TRUE AND p.status = 'active'", [id, req.session.userId]);
    if (!row.rows.length) return res.status(404).json({ error: "Cart item not found" });
    if (quantity <= 0) await pool.query("DELETE FROM cart WHERE id = $1 AND user_id = $2", [id, req.session.userId]);
    else if (quantity > row.rows[0].stock) return res.status(409).json({ error: "Requested quantity exceeds available stock" });
    else await pool.query("UPDATE cart SET quantity = $1 WHERE id = $2 AND user_id = $3", [quantity, id, req.session.userId]);
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update cart" });
  }
});

app.post("/api/cart/empty", requireLogin, async (req, res) => {
  await pool.query("DELETE FROM cart WHERE user_id = $1", [req.session.userId]);
  res.sendStatus(200);
});

app.post("/api/checkout", requireLogin, async (req, res) => {
  const paymentsEnabled = process.env.PAYMENTS_ENABLED === "true";
  const apiKey = process.env.MOLLIE_API_KEY;
  const baseUrl = String(process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");

  if (!paymentsEnabled || !apiKey || !baseUrl)
    return res.status(503).json({ error: "Online checkout is not configured yet." });
  if (isProduction && !baseUrl.startsWith("https://"))
    return res.status(503).json({ error: "Secure PUBLIC_BASE_URL is required in production." });

  const {
    customer_name,
    customer_email,
    shipping_address_line1,
    shipping_postcode,
    shipping_city,
    shipping_country
  } = req.body || {};

  const email = String(customer_email || "").trim().toLowerCase();
  const name = String(customer_name || "").trim();
  const address = String(shipping_address_line1 || "").trim();
  const postcode = String(shipping_postcode || "").trim();
  const city = String(shipping_city || "").trim();
  const country = String(shipping_country || "NL").trim().toUpperCase();

  if (!name || name.length > 120) return res.status(400).json({ error: "Enter your full name" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: "Enter a valid email address" });
  if (!address || address.length > 200) return res.status(400).json({ error: "Enter your delivery address" });
  if (!postcode || postcode.length > 30) return res.status(400).json({ error: "Enter your postcode" });
  if (!city || city.length > 100) return res.status(400).json({ error: "Enter your city" });
  if (!/^[A-Z]{2}$/.test(country)) return res.status(400).json({ error: "Enter a valid two-letter country code" });
  if (req.body?.accept_terms !== true) return res.status(400).json({ error: "Please confirm the terms and withdrawal information" });

  const client = await pool.connect();
  let orderId = null;

  try {
    await client.query("BEGIN");
    const cart = await client.query(`
      SELECT c.product_id, c.quantity, p.price, p.stock, p.name
      FROM cart c
      JOIN products p ON c.product_id = p.id
      WHERE c.user_id = $1
        AND p.is_active = TRUE
        AND p.status = 'active'
      FOR UPDATE OF p
    `, [req.session.userId]);

    if (!cart.rows.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Cart empty" });
    }

    for (const item of cart.rows) {
      if (item.quantity > item.stock) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: `Not enough stock for ${item.name}` });
      }
    }

    const total = cart.rows.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
    if (!Number.isFinite(total) || total <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Invalid order total" });
    }

    const order = await client.query(
      `INSERT INTO orders (
        user_id, total, status, customer_name, customer_email,
        shipping_address_line1, shipping_postcode, shipping_city, shipping_country
      ) VALUES ($1, $2, 'payment_pending', $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [req.session.userId, total, name, email, address, postcode, city, country]
    );
    orderId = order.rows[0].id;

    for (const item of cart.rows) {
      await client.query(
        "INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)",
        [orderId, item.product_id, item.quantity, item.price]
      );
      await client.query(
        "UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1",
        [item.quantity, item.product_id]
      );
    }

    await client.query("DELETE FROM cart WHERE user_id = $1", [req.session.userId]);
    await client.query("COMMIT");

    const paymentResponse = await fetch("https://api.mollie.com/v2/payments", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        amount: { currency: "EUR", value: total.toFixed(2) },
        description: `FLIGALIGA Order #${orderId}`,
        redirectUrl: `${baseUrl}/payment-result?order=${orderId}`,
        cancelUrl: `${baseUrl}/payment-result?order=${orderId}&cancelled=1`,
        webhookUrl: `${baseUrl}/api/payments/mollie-webhook`,
        metadata: { order_id: String(orderId) }
      })
    });

    const payment = await paymentResponse.json().catch(() => null);
    if (!paymentResponse.ok || !payment?.id || !payment?._links?.checkout?.href) {
      await releaseReservedStock(orderId, "payment_creation_failed");
      return res.status(502).json({ error: "Could not start the payment. Your reserved stock has been released." });
    }

    await pool.query(
      "UPDATE orders SET payment_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [payment.id, orderId]
    );

    res.json({ success: true, orderId, total, checkoutUrl: payment._links.checkout.href });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (orderId) await releaseReservedStock(orderId, "checkout_error").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "Checkout failed" });
  } finally {
    client.release();
  }
});

async function releaseReservedStock(orderId, status = "payment_failed") {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const order = await client.query(
      "SELECT status, stock_released_at FROM orders WHERE id = $1 FOR UPDATE",
      [orderId]
    );
    if (!order.rows.length) {
      await client.query("ROLLBACK");
      return;
    }
    if (order.rows[0].stock_released_at || order.rows[0].status === "paid") {
      await client.query("COMMIT");
      return;
    }

    const items = await client.query(
      "SELECT product_id, quantity FROM order_items WHERE order_id = $1",
      [orderId]
    );
    for (const item of items.rows) {
      await client.query(
        "UPDATE products SET stock = stock + $1 WHERE id = $2",
        [item.quantity, item.product_id]
      );
    }
    await client.query(
      "UPDATE orders SET status = $1, stock_released_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [status, orderId]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

app.post("/api/payments/mollie-webhook", async (req, res) => {
  const apiKey = process.env.MOLLIE_API_KEY;
  const paymentId = String(req.body?.id || req.query?.id || "").trim();
  if (!apiKey || !paymentId) return res.sendStatus(400);

  try {
    const response = await fetch(`https://api.mollie.com/v2/payments/${encodeURIComponent(paymentId)}`, {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json"
      }
    });
    const payment = await response.json().catch(() => null);
    if (!response.ok || !payment?.id) return res.sendStatus(502);

    const metadataOrderId = payment.metadata?.order_id ? Number(payment.metadata.order_id) : null;
    const orderResult = await pool.query(
      metadataOrderId
        ? "SELECT id, total, status, stock_released_at FROM orders WHERE payment_id = $1 OR id = $2 LIMIT 1"
        : "SELECT id, total, status, stock_released_at FROM orders WHERE payment_id = $1 LIMIT 1",
      metadataOrderId ? [paymentId, metadataOrderId] : [paymentId]
    );
    if (!orderResult.rows.length) return res.sendStatus(404);

    const order = orderResult.rows[0];
    const paymentAmount = payment.amount?.currency === "EUR" ? Number(payment.amount.value) : NaN;
    if (!Number.isFinite(paymentAmount) || Math.abs(paymentAmount - Number(order.total)) > 0.005)
      return res.sendStatus(409);

    switch (payment.status) {
      case "paid":
        await pool.query(
          `UPDATE orders
           SET status = 'paid', paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND status <> 'paid'`,
          [order.id]
        );
        break;
      case "failed":
        await releaseReservedStock(order.id, "payment_failed");
        break;
      case "canceled":
        await releaseReservedStock(order.id, "canceled");
        break;
      case "expired":
        await releaseReservedStock(order.id, "expired");
        break;
      default:
        await pool.query(
          "UPDATE orders SET status = 'payment_pending', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status <> 'paid'",
          [order.id]
        );
        break;
    }

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.get("/api/orders/:id", requireLogin, async (req, res) => {
  const orderId = Number(req.params.id);
  if (!Number.isInteger(orderId) || orderId <= 0) return res.status(400).json({ error: "Invalid order number" });
  try {
    const result = await pool.query(
      `SELECT id, total, status, created_at, customer_name, customer_email
       FROM orders
       WHERE id = $1 AND user_id = $2`,
      [orderId, req.session.userId]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Order not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load order" });
  }
});

app.get("/api/admin/orders", requireAdmin, async (req, res) => {
  try {
    const orders = await pool.query(`
      SELECT o.id, o.user_id, o.total, o.status, o.created_at, o.customer_name,
             o.customer_email, o.shipping_address_line1, o.shipping_postcode,
             o.shipping_city, o.shipping_country, u.username
      FROM orders o
      JOIN users u ON o.user_id = u.id
      ORDER BY o.id DESC
    `);
    const items = await pool.query(`
      SELECT oi.order_id, p.name, oi.quantity, oi.price
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
    `);
    res.json(orders.rows.map(o => ({ ...o, items: items.rows.filter(i => i.order_id === o.id) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load orders" });
  }
});

app.post("/api/withdrawal", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const reason = String(req.body?.reason || "").trim();
  const orderId = req.body?.order_id ? Number(req.body.order_id) : null;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    return res.status(400).json({ error: "Enter a valid email address" });
  if (reason.length > 2000)
    return res.status(400).json({ error: "Reason is too long" });
  if (orderId !== null && (!Number.isInteger(orderId) || orderId <= 0))
    return res.status(400).json({ error: "Invalid order number" });

  try {
    if (orderId !== null) {
      const order = await pool.query(
        "SELECT id FROM orders WHERE id = $1 AND lower(customer_email) = $2",
        [orderId, email]
      );
      if (!order.rows.length) return res.status(404).json({ error: "Order not found for that email address" });
    }

    const result = await pool.query(
      `INSERT INTO withdrawal_requests (order_id, email, reason)
       VALUES ($1, $2, $3)
       RETURNING id, submitted_at`,
      [orderId, email, reason || null]
    );
    res.status(201).json({ success: true, requestId: result.rows[0].id, submittedAt: result.rows[0].submitted_at });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not submit withdrawal request" });
  }
});

// SPA routes: product URLs are real, shareable URLs, while the client loads the product data.
app.use(express.static(publicDir));
app.get("/product/:idOrSlug", (req, res) => res.sendFile(path.join(publicDir, "index.html")));
app.get(["/", "/treasures", "/new-arrivals", "/ledger", "/merchant", "/faq", "/contact", "/shipping", "/returns", "/privacy", "/terms", "/withdrawal", "/accessibility", "/payment-result"], (req, res) => res.sendFile(path.join(publicDir, "index.html")));

app.listen(PORT, () => console.log(`🧭 FLIGALIGA Vault running at http://localhost:${PORT}`));
