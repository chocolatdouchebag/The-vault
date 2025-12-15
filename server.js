/* ============================
        IMPORTS & SETUP
============================ */
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcrypt");
const { Pool } = require("pg");
const bodyParser = require("body-parser");
require("dotenv").config();

const app = express();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://grey:hound@localhost:5432/webshop"
});

app.use(bodyParser.json());
app.use(express.static('public'));
app.use(session({
  secret: "supersecretkey",
  resave: false,
  saveUninitialized: true
}));

app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; " +
    "img-src 'self' data:; " +
    "script-src 'self'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com;"
  );
  next();
});

/* ============================
        MIDDLEWARE
============================ */
function requireLogin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Login required" });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Login required" });
  if (!req.session.isAdmin) return res.status(403).json({ error: "Admin only" });
  next();
}

/* ============================
        REGISTER & LOGIN
============================ */
app.post("/api/register", async (req, res) => {
  const { username, password } = req.body;
  const hash = await bcrypt.hash(password, 10);

  try {
    await pool.query(
      "INSERT INTO users (username, password) VALUES ($1, $2)",
      [username, hash]
    );
    res.sendStatus(200);
  } catch {
    res.status(400).send("User already exists");
  }
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  const result = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
  if (result.rows.length === 0) return res.status(401).send("Invalid login");

  const user = result.rows[0];
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).send("Invalid login");

  req.session.userId = user.id;
  req.session.isAdmin = user.is_admin;  
  req.session.user = { id: user.id, username: user.username, isAdmin: user.is_admin };
  req.session.save();

  res.sendStatus(200);
});

app.post("/api/logout", (req, res) => {
  req.session.destroy();
  res.sendStatus(200);
});

app.get("/api/me", (req, res) => {
  res.json(req.session.user || null);
});

/* ============================
        PRODUCTS
============================ */
app.get("/api/products", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM products ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load products" });
  }
});

app.post("/api/admin/product", requireAdmin, async (req, res) => {
  const { name, description, price, stock, image_url, category } = req.body;

  try {
    await pool.query(
      `INSERT INTO products (name, description, price, stock, image_url, category)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [name, description, price, stock, image_url, category]
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

/* ============================
          CART
============================ */
app.post("/api/cart", requireLogin, async (req, res) => {
  const { product_id } = req.body;
  const userId = req.session.userId;

  const existing = await pool.query(
    "SELECT id FROM cart WHERE user_id = $1 AND product_id = $2",
    [userId, product_id]
  );

  if (existing.rows.length > 0) {
    await pool.query(
      "UPDATE cart SET quantity = quantity + 1 WHERE id = $1",
      [existing.rows[0].id]
    );
  } else {
    await pool.query(
      "INSERT INTO cart (user_id, product_id, quantity) VALUES ($1, $2, 1)",
      [userId, product_id]
    );
  }

  res.sendStatus(200);
});

app.get("/api/cart", requireLogin, async (req, res) => {
  const userId = req.session.userId;

  const cart = await pool.query(`
    SELECT c.id, c.product_id, c.quantity, p.name, p.price, p.image_url
    FROM cart c
    JOIN products p ON c.product_id = p.id
    WHERE c.user_id = $1
  `, [userId]);

  res.json(cart.rows);
});

app.post("/api/cart/update", requireLogin, async (req, res) => {
  const { id, quantity } = req.body;

  if (quantity <= 0) {
    await pool.query("DELETE FROM cart WHERE id = $1", [id]);
  } else {
    await pool.query("UPDATE cart SET quantity = $1 WHERE id = $2", [quantity, id]);
  }

  res.sendStatus(200);
});

app.post("/api/cart/empty", requireLogin, async (req, res) => {
  await pool.query("DELETE FROM cart WHERE user_id = $1", [req.session.userId]);
  res.sendStatus(200);
});

/* ============================
          CHECKOUT
============================ */
app.post("/api/checkout", requireLogin, async (req, res) => {
  const userId = req.session.userId;

  const cart = await pool.query(`
    SELECT c.product_id, c.quantity, p.price, p.stock
    FROM cart c
    JOIN products p ON c.product_id = p.id
    WHERE c.user_id = $1
  `, [userId]);

  if (cart.rows.length === 0)
    return res.status(400).json({ error: "Cart empty" });

  for (const item of cart.rows) {
    if (item.quantity > item.stock)
      return res.status(400).json({ error: "Not enough stock" });
  }

  const total = cart.rows.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const order = await pool.query(
    "INSERT INTO orders (user_id, total) VALUES ($1, $2) RETURNING id",
    [userId, total]
  );

  const orderId = order.rows[0].id;

  for (const item of cart.rows) {
    await pool.query(`
      INSERT INTO order_items (order_id, product_id, quantity, price)
      VALUES ($1, $2, $3, $4)
    `, [orderId, item.product_id, item.quantity, item.price]);

    await pool.query(`
      UPDATE products SET stock = stock - $1 WHERE id = $2
    `, [item.quantity, item.product_id]);
  }

  await pool.query("DELETE FROM cart WHERE user_id = $1", [userId]);

  res.json({ success: true, orderId });
});

/* ============================
        ADMIN ORDERS
============================ */
app.get("/api/admin/orders", requireAdmin, async (req, res) => {
  const orders = await pool.query(`
    SELECT o.id, o.user_id, o.total, o.status, o.created_at, u.username
    FROM orders o
    JOIN users u ON o.user_id = u.id
    ORDER BY o.id DESC
  `);

  const items = await pool.query(`
    SELECT oi.order_id, p.name, oi.quantity, oi.price
    FROM order_items oi
    JOIN products p ON oi.product_id = p.id
  `);

  const final = orders.rows.map(order => ({
    ...order,
    items: items.rows.filter(item => item.order_id === order.id)
  }));

  res.json(final);
});

/* ============================
        START SERVER
============================ */
app.listen(3000, () => {
  console.log("✅ Webshop running at http://localhost:3000");
});
