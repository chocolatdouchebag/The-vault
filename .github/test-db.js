const bcrypt = require("bcrypt");

const state = {
  fail: process.env.TEST_DB_FAIL === "1",
  users: [],
  sessions: new Map(),
  products: [
    { id: 1, name: "COMPASS", description: "A test compass", price: 14.99, stock: 45, image_url: "/assets/compass.png", category: "Collectibles", rarity: "Very Rare", origin: "North Sea", condition: "Pristine", provenance: "Test harbour", is_featured: true, is_new_arrival: true, is_active: true, status: "active" },
    { id: 2, name: "TEST VASE", description: "A test vase", price: 29.99, stock: 5, image_url: "/assets/vase.png", category: "Artifacts", rarity: "Rare", origin: "Test origin", condition: "Good", provenance: "Test archive", is_featured: false, is_new_arrival: false, is_active: true, status: "active" }
  ],
  orders: [],
  nextUserId: 3
};

let ready;
async function init() {
  if (ready) return ready;
  ready = (async () => {
    state.users = [
      { id: 1, username: "test-admin", password: await bcrypt.hash("AdminPassword123!", 10), is_admin: true },
      { id: 2, username: "test-user", password: await bcrypt.hash("CustomerPassword123!", 10), is_admin: false }
    ];
  })();
  return ready;
}

async function query(sql, params = []) {
  await init();
  if (state.fail) throw new Error("Simulated database outage");
  const q = sql.replace(/\s+/g, " ").trim().toLowerCase();

  if (q === "select 1") return { rows: [{ "?column?": 1 }] };

  if (q.startsWith("select sess from session")) {
    const row = state.sessions.get(String(params[0]));
    if (!row || row.expire <= Date.now()) return { rows: [] };
    return { rows: [{ sess: row.sess }] };
  }
  if (q.startsWith("insert into session")) {
    state.sessions.set(String(params[0]), { sess: typeof params[1] === "string" ? JSON.parse(params[1]) : params[1], expire: new Date(params[2]).getTime() });
    return { rows: [] };
  }
  if (q.startsWith("update session set expire")) {
    const row = state.sessions.get(String(params[0]));
    if (row) row.expire = new Date(params[1]).getTime();
    return { rows: [] };
  }
  if (q.startsWith("delete from session")) {
    state.sessions.delete(String(params[0]));
    return { rows: [] };
  }

  if (q.startsWith("select is_admin from users")) {
    const user = state.users.find(u => u.id === Number(params[0]));
    return { rows: user ? [{ is_admin: user.is_admin }] : [] };
  }
  if (q.startsWith("select * from users where username")) {
    const user = state.users.find(u => u.username === params[0]);
    return { rows: user ? [user] : [] };
  }
  if (q.startsWith("select id, username, is_admin from users")) {
    const user = state.users.find(u => u.id === Number(params[0]));
    return { rows: user ? [{ id: user.id, username: user.username, is_admin: user.is_admin }] : [] };
  }
  if (q.startsWith("insert into users")) {
    if (state.users.some(u => u.username === params[0])) {
      const err = new Error("duplicate");
      err.code = "23505";
      throw err;
    }
    state.users.push({ id: state.nextUserId++, username: params[0], password: params[1], is_admin: false });
    return { rows: [] };
  }

  if (q.startsWith("select * from products where is_active = true")) {
    const rows = state.products
      .filter(p => p.is_active && p.status === "active")
      .sort((a, b) => Number(b.is_featured) - Number(a.is_featured) || Number(b.is_new_arrival) - Number(a.is_new_arrival) || b.id - a.id)
      .map(p => ({ ...p }));
    return { rows };
  }
  if (q.startsWith("select * from products order by id desc")) {
    return { rows: [...state.products].sort((a, b) => b.id - a.id).map(p => ({ ...p })) };
  }
  if (q.startsWith("update products set is_active = false")) {
    const p = state.products.find(x => x.id === Number(params[0]));
    return { rows: p ? ((p.is_active = false), [{ id: p.id }]) : [] };
  }
  if (q.startsWith("update products set name =")) {
    const id = Number(params[12]);
    const p = state.products.find(x => x.id === id);
    if (!p) return { rows: [] };
    Object.assign(p, {
      name: params[0], description: params[1], price: params[2], stock: params[3],
      image_url: params[4], category: params[5], rarity: params[6], origin: params[7],
      condition: params[8], provenance: params[9], is_featured: params[10], is_new_arrival: params[11]
    });
    return { rows: [{ ...p }] };
  }
  if (q.startsWith("insert into products")) {
    const p = {
      id: Math.max(0, ...state.products.map(x => x.id)) + 1,
      name: params[0], description: params[1], price: params[2], stock: params[3],
      image_url: params[4], category: params[5], rarity: params[6], origin: params[7],
      condition: params[8], provenance: params[9], is_featured: params[10], is_new_arrival: params[11],
      is_active: true, status: "active"
    };
    state.products.push(p);
    return { rows: [{ id: p.id }] };
  }

  if (q.startsWith("select id, user_id, total")) return { rows: [] };
  if (q.startsWith("select oi.order_id")) return { rows: [] };

  if (q.startsWith("delete from withdrawal_requests")) return { rows: [] };
  if (q.startsWith("insert into withdrawal_requests")) return { rows: [{ id: 1, submitted_at: new Date().toISOString() }] };

  return { rows: [] };
}

function connect() {
  return Promise.resolve({
    query,
    release() {}
  });
}

const pool = {
  query,
  connect,
  on() {},
  end: async () => {}
};

module.exports = pool;
