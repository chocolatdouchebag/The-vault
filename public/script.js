document.addEventListener("DOMContentLoaded", init);

// ---------- HELPERS ----------
function $id(id) { return document.getElementById(id); }
function fmtPrice(v) { return '€' + Number(v).toFixed(2); }
function showSection(name) {
  ['auth', 'products', 'cart', 'admin', 'order-summary'].forEach(s => {
    const el = $id(s);
    if (el) el.style.display = (s === name ? '' : 'none');
  });
}

// ---------- STATE ----------
let isAdmin = false;

// ---------- AUTH ----------
async function register() {
  const username = $id('reg-user')?.value.trim();
  const password = $id('reg-pass')?.value;
  if (!username || !password) return alert('Fill in username & password');

  const res = await fetch('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
    credentials: 'include'
  });

  if (res.ok) {
    alert('Registered! Please log in.');
    $id('reg-user').value = '';
    $id('reg-pass').value = '';
  } else {
    alert('Registration failed');
  }
}

async function login() {
  const username = $id('login-user')?.value.trim();
  const password = $id('login-pass')?.value;
  if (!username || !password) return alert('Fill in username & password');

  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
    credentials: 'include'
  });

  if (res.ok) {
    $id('login-user').value = '';
    $id('login-pass').value = '';
    await postLoginSetup();
    showSection('products');
    await loadCart();
  } else {
    const text = await res.text();
    alert('Login failed: ' + text);
  }
}

async function logout() {
  await fetch('/api/logout', { method: 'POST', credentials: 'include' });
  isAdmin = false;
  if ($id('nav-admin')) $id('nav-admin').style.display = 'none';
  if ($id('logout-btn')) $id('logout-btn').style.display = 'none';
  showSection('auth');
  await loadProducts();
  await loadCart();
}

async function postLoginSetup() {
  try {
    const res = await fetch('/api/admin/orders', { credentials: 'include' });
    if (res.ok) {
      isAdmin = true;
      if ($id('nav-admin')) $id('nav-admin').style.display = '';
      if ($id('logout-btn')) $id('logout-btn').style.display = '';
      await loadAdminOrders();
    } else {
      isAdmin = false;
      if ($id('nav-admin')) $id('nav-admin').style.display = 'none';
      if ($id('logout-btn')) $id('logout-btn').style.display = '';
    }
  } catch (e) {
    console.error('postLoginSetup', e);
  }
}

// ---------- PRODUCTS ----------
async function loadProducts() {
  try {
    const res = await fetch('/api/products', { credentials: 'include' });
    const products = await res.json();
    const container = $id('products-list');
    if (!container) return;

    container.innerHTML = '';
    products.forEach(p => {
      const price = Number(p.price || 0);
      const el = document.createElement('div');
      el.className = 'product';
      const img = p.image_url ? `<img src="${p.image_url}" alt="${p.name}">` : '';
      el.innerHTML = `
        ${img}
        <div class="title">${p.name}</div>
        <div class="meta">${p.description || ''}</div>
        <div class="product-footer">
          <div class="meta">${fmtPrice(price)}</div>
          <div>
            <button onclick="addToCart(${p.id})">Add to Cart</button>
            ${isAdmin ? `<button onclick="adminDeleteProduct(${p.id})" class="delete-btn">Delete</button>` : ''}
          </div>
        </div>
      `;
      container.appendChild(el);
    });
  } catch (e) {
    console.error('loadProducts', e);
  }
}

// ---------- CART UI HELPER ----------
function updateCartUI(items) {
  const list = $id('cart-list');
  const totalEl = $id('cart-total');
  const badge = $id('cart-count');
  if (!list || !totalEl || !badge) return;

  list.innerHTML = '';
  let total = 0;

  if (!items || items.length === 0) {
    list.innerHTML = '<li>(Cart is empty)</li>';
    totalEl.innerText = 'Total: €0.00';
    badge.innerText = '0';
    return;
  }

  items.forEach(it => {
    const price = Number(it.price || 0);
    const qty = Number(it.quantity || 0);
    const itemTotal = price * qty;
    total += itemTotal;

    const li = document.createElement('li');
    li.className = 'cart-item';
    li.innerHTML = `
      <div style="flex:1;">
        <div style="font-weight:600">${it.name}</div>
        <div class="meta">${fmtPrice(price)} x ${qty} = ${fmtPrice(itemTotal)}</div>
      </div>
      <div class="qty">
        <button onclick="updateCart(${it.id}, ${qty - 1})">−</button>
        <div class="qty-display">${qty}</div>
        <button onclick="updateCart(${it.id}, ${qty + 1})">+</button>
      </div>
    `;
    list.appendChild(li);
  });

  totalEl.innerText = `Total: ${fmtPrice(total)}`;
  badge.innerText = items.reduce((s, i) => s + Number(i.quantity), 0);
}

// ---------- CART FUNCTIONS ----------
async function loadCart() {
  try {
    const res = await fetch('/api/cart', { credentials: 'include' });
    const items = res.ok ? await res.json() : [];
    updateCartUI(items);
  } catch (e) {
    console.error('loadCart', e);
    updateCartUI([]);
  }
}

async function addToCart(productId) {
  try {
    const res = await fetch('/api/cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: productId }),
      credentials: 'include'
    });
    if (!res.ok) return alert('Add to cart failed');
    await loadCart();
  } catch (e) { console.error('addToCart', e); }
}

async function updateCart(cartId, newQty) {
  if (newQty < 0) return;
  try {
    const res = await fetch('/api/cart/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: cartId, quantity: newQty }),
      credentials: 'include'
    });
    if (!res.ok) return alert('Update failed');
    await loadCart();
  } catch (e) { console.error('updateCart', e); }
}

async function emptyCart() {
  if (!confirm('Empty your cart?')) return;
  try {
    const res = await fetch('/api/cart/empty', { method: 'POST', credentials: 'include' });
    if (res.ok) {
      await loadCart();
      alert('Cart emptied successfully');
    } else if (res.status === 401) {
      alert('You must be logged in to empty your cart.');
    } else {
      alert('Failed to empty cart.');
    }
  } catch (e) { console.error('emptyCart', e); }
}

async function checkout() {
  try {
    const res = await fetch('/api/checkout', { method: 'POST', credentials: 'include' });
    if (!res.ok) {
      const txt = await res.text();
      return alert('Checkout failed: ' + txt);
    }
    const data = await res.json();
    if ($id('order-summary-items')) $id('order-summary-items').innerHTML = `<li>Order #${data.orderId} placed successfully.</li>`;
    if ($id('order-summary-total')) $id('order-summary-total').innerText = `Total: ${fmtPrice(data.total || 0)}`;
    showSection('order-summary');
    await loadCart();
  } catch (e) { console.error('checkout', e); }
}

// ---------- ADMIN FUNCTIONS ----------
async function adminAddProduct() {
  const name = $id('prod-name')?.value.trim();
  const price = Number($id('prod-price')?.value);
  const stock = Number($id('prod-stock')?.value) || 0;
  const image_url = $id('prod-image')?.value.trim() || null;
  if (!name || isNaN(price)) return alert('Provide name and price');

  try {
    const res = await fetch('/api/admin/product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, price, stock, image_url }),
      credentials: 'include'
    });
    if (res.ok) {
      $id('prod-name').value = '';
      $id('prod-price').value = '';
      $id('prod-stock').value = '';
      $id('prod-image').value = '';
      await loadProducts();
      await loadAdminOrders();
    } else {
      const text = await res.text();
      alert('Add product failed: ' + text);
    }
  } catch (e) { console.error('adminAddProduct', e); }
}

async function loadAdminOrders() {
  const container = $id('admin-orders');
  if (!container) return;
  try {
    const res = await fetch('/api/admin/orders', { credentials: 'include' });
    container.innerHTML = '';
    if (!res.ok) {
      container.innerHTML = '<div>(no admin privileges)</div>';
      return;
    }
    const data = await res.json();
    data.forEach(o => {
      const div = document.createElement('div');
      div.innerHTML = `<strong>Order #${o.id}</strong> by ${o.username} — ${fmtPrice(o.total)}`;
      const ul = document.createElement('ul');
      o.items.forEach(i => {
        const li = document.createElement('li');
        li.textContent = `${i.name} x ${i.quantity} @ ${fmtPrice(i.price)}`;
        ul.appendChild(li);
      });
      div.appendChild(ul);
      container.appendChild(div);
    });
  } catch (e) {
    console.error('loadAdminOrders', e);
    container.innerHTML = '<div>(failed to load admin orders)</div>';
  }
}

// ---------- INIT ----------
async function init() {
  await loadProducts();
  await loadCart();

  try {
    const r = await fetch('/api/admin/orders', { credentials: 'include' });
    if (r.ok) {
      isAdmin = true;
      if ($id('nav-admin')) $id('nav-admin').style.display = '';
      if ($id('logout-btn')) $id('logout-btn').style.display = '';
      await loadAdminOrders();
    } else {
      isAdmin = false;
      if ($id('nav-admin')) $id('nav-admin').style.display = 'none';
      if ($id('logout-btn')) $id('logout-btn').style.display = 'none';
    }
  } catch (e) { console.error('init', e); }

  showSection('products');
}
