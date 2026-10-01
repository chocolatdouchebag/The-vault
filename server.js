const express = require("express");
const session = require("express-session");
const bcrypt = require("bcrypt");
const bodyParser = require("body-parser");
const path = require("path");
const pool = require("./db");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, "public");
const isProduction = process.env.NODE_ENV === "production";
if (isProduction && !process.env.SESSION_SECRET) throw new Error("SESSION_SECRET must be set in production");
app.disable("x-powered-by");
if (isProduction) app.set("trust proxy", 1);

app.use(bodyParser.json());
app.use(session({
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
    "connect-src 'self';"
  );
  next();
});

function requireLogin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Login required" });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Login required" });
  if (!req.session.isAdmin) return res.status(403).json({ error: "Admin only" });
  next();
}

function productSlug(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

app.post("/api/register", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).send("Username and password required");
  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query("INSERT INTO users (username, password) VALUES ($1, $2)", [username, hash]);
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.status(400).send("User already exists");
  }
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body || {};
  try {
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
    if (!result.rows.length) return res.status(401).send("Invalid login");
    const user = result.rows[0];
    if (!(await bcrypt.compare(password || "", user.password))) return res.status(401).send("Invalid login");
    req.session.userId = user.id;
    req.session.isAdmin = user.is_admin;
    req.session.user = { id: user.id, username: user.username, isAdmin: user.is_admin };
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.status(500).send("Login failed");
  }
});

app.post("/api/logout", (req, res) => req.session.destroy(() => res.sendStatus(200)));
app.get("/api/me", (req, res) => res.json(req.session.user || null));
app.get("/api/health", async (req, res) => { try { await pool.query("SELECT 1"); res.json({ ok: true }); } catch (err) { res.status(503).json({ ok: false }); } });

app.get("/api/products", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM products ORDER BY id DESC");
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
      const result = await pool.query("SELECT * FROM products WHERE id = $1", [Number(idMatch[1])]);
      product = result.rows[0];
    } else {
      const result = await pool.query("SELECT * FROM products");
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
  const { name, description, price, stock, image_url, category, rarity, origin, condition, provenance, is_featured, is_new_arrival } = req.body || {};
  if (!name || price === undefined) return res.status(400).json({ error: "Name and price required" });
  try {
    await pool.query(
      `INSERT INTO products (name, description, price, stock, image_url, category, rarity, origin, condition, provenance, is_featured, is_new_arrival)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [name, description || "", price, stock ?? 0, image_url || null, category || "Artifacts", rarity || null, origin || null, condition || null, provenance || null, is_featured === true, is_new_arrival === true]
    );
    res.sendStatus(200);
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

app.post("/api/cart", requireLogin, async (req, res) => {
  const productId = Number(req.body?.product_id);
  if (!productId) return res.status(400).json({ error: "Invalid product" });
  const userId = req.session.userId;
  try {
    const existing = await pool.query("SELECT id FROM cart WHERE user_id = $1 AND product_id = $2", [userId, productId]);
    if (existing.rows.length) {
      await pool.query("UPDATE cart SET quantity = quantity + 1 WHERE id = $1", [existing.rows[0].id]);
    } else {
      await pool.query("INSERT INTO cart (user_id, product_id, quantity) VALUES ($1, $2, 1)", [userId, productId]);
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
  try {
    if (quantity <= 0) await pool.query("DELETE FROM cart WHERE id = $1 AND user_id = $2", [id, req.session.userId]);
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
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cart = await client.query(`
      SELECT c.product_id, c.quantity, p.price, p.stock, p.name
      FROM cart c JOIN products p ON c.product_id = p.id
      WHERE c.user_id = $1 FOR UPDATE
    `, [req.session.userId]);
    if (!cart.rows.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Cart empty" });
    }
    for (const item of cart.rows) if (item.quantity > item.stock) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: `Not enough stock for ${item.name}` });
    }
    const total = cart.rows.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
    const order = await client.query("INSERT INTO orders (user_id, total) VALUES ($1, $2) RETURNING id", [req.session.userId, total]);
    const orderId = order.rows[0].id;
    for (const item of cart.rows) {
      await client.query("INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)", [orderId, item.product_id, item.quantity, item.price]);
      await client.query("UPDATE products SET stock = stock - $1 WHERE id = $2", [item.quantity, item.product_id]);
    }
    await client.query("DELETE FROM cart WHERE user_id = $1", [req.session.userId]);
    await client.query("COMMIT");
    res.json({ success: true, orderId, total });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "Checkout failed" });
  } finally { client.release(); }
});

app.get("/api/admin/orders", requireAdmin, async (req, res) => {
  try {
    const orders = await pool.query(`SELECT o.id, o.user_id, o.total, o.status, o.created_at, u.username FROM orders o JOIN users u ON o.user_id = u.id ORDER BY o.id DESC`);
    const items = await pool.query(`SELECT oi.order_id, p.name, oi.quantity, oi.price FROM order_items oi JOIN products p ON oi.product_id = p.id`);
    res.json(orders.rows.map(o => ({ ...o, items: items.rows.filter(i => i.order_id === o.id) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load orders" });
  }
});

// SPA routes: product URLs are real, shareable URLs, while the client loads the product data.
app.use(express.static(publicDir));
app.get("/product/:idOrSlug", (req, res) => res.sendFile(path.join(publicDir, "index.html")));
app.get(["/", "/treasures", "/new-arrivals", "/ledger", "/merchant", "/faq", "/contact", "/shipping", "/returns", "/privacy"], (req, res) => res.sendFile(path.join(publicDir, "index.html")));

app.listen(PORT, () => console.log(`🧭 FLIGALIGA Vault running at http://localhost:${PORT}`));
