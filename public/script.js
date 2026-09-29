document.addEventListener("DOMContentLoaded", init);

// ---------- HELPERS ----------
function $id(id) { return document.getElementById(id); }

function fmtPrice(v) { return '€' + Number(v).toFixed(2); }

function showSection(name) {
  // Save the current shop position before leaving the products section
  if (name !== 'products' && window.currentSection === 'products') {
    window.productsScrollPosition = window.scrollY;
  }

  // Show the requested section and hide the others
  [
    'home',
    'auth',
    'products',
    'cart',
    'admin',
    'admin-orders',
    'order-summary',
    'product-examination'
  ].forEach(s => {
    const el = $id(s);

    if (el) {
      el.style.display = (s === name ? '' : 'none');
    }
  });

  // Homepage-only elements
  const hero = document.querySelector('.shop-hero');
  const merchantIntro = document.querySelector('.merchant-intro');

  const isHome = name === 'home';

  if (hero) {
    hero.style.display = isHome ? '' : 'none';
  }

  if (merchantIntro) {
    merchantIntro.style.display = isHome ? '' : 'none';
  }

  // Remember which section we're currently viewing
  window.currentSection = name;

  // Returning to the shop
  if (name === 'products') {
    window.requestAnimationFrame(() => {
      window.scrollTo({
        top: window.productsScrollPosition || 0,
        behavior: 'instant'
      });
    });
  }

  // Everything else starts at the top
  else {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    }); 
  }
}

function showSection(name) {
  // Save the current shop position before leaving the products section
  if (name !== 'products' && window.currentSection === 'products') {
    window.productsScrollPosition = window.scrollY;
  }

  // Show the requested section and hide the others
  [
    'home',
    'auth',
    'products',
    'cart',
    'admin',
    'admin-orders',
    'order-summary',
    'product-examination'
  ].forEach(s => {
    const el = $id(s);

    if (el) {
      el.style.display = (s === name ? '' : 'none');
    }
  });

  // Homepage-only elements
  const hero = document.querySelector('.shop-hero');
  const merchantIntro = document.querySelector('.merchant-intro');

  const isHome = name === 'home';

  if (hero) {
    hero.style.display = isHome ? '' : 'none';
  }

  if (merchantIntro) {
    merchantIntro.style.display = isHome ? '' : 'none';
  }

  // Remember which section we're currently viewing
  window.currentSection = name;

  // Returning to the shop
  if (name === 'products') {
    window.requestAnimationFrame(() => {
      window.scrollTo({
        top: window.productsScrollPosition || 0,
        behavior: 'instant'
      });
    });
  }

  // Everything else starts at the top
  else {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }
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
products.forEach((p, index) => {
  const price = Number(p.price || 0);

  const el = document.createElement('div');
  el.className = 'product';

  const catalogueNumber =
    String(index + 1).padStart(3, '0');

  const img = p.image_url
    ? `
      <div class="product-image-wrap">
        <img
          src="${p.image_url}"
          alt="${p.name}"
        >

        <div class="product-image-overlay">
          <span>✦</span>
          <span>EXAMINE</span>
        </div>
      </div>
      `
    : `
      <div class="product-image-wrap product-no-image">
        <div class="no-image-symbol">
          ◈
        </div>

        <span>
          IMAGE UNRECORDED
        </span>
      </div>
      `;

  const description =
    p.description ||
    'The merchant has recorded no description for this particular treasure.';

  el.innerHTML = `
    ${img}

    <div class="product-content">

      <div class="product-catalogue-header">
        <span class="product-catalogue-number">
          CAT. ${catalogueNumber}
        </span>

        <span class="product-status">
          ${p.stock > 0 ? 'AVAILABLE' : 'UNAVAILABLE'}
        </span>
      </div>

      <h3>
        ${p.name}
      </h3>

      <p class="product-description">
        ${description}
      </p>

      <div class="product-footer">

        <div class="product-price">
          ${fmtPrice(price)}
        </div>

        <div class="product-actions">

          <button
            class="acquire-btn"
            onclick="event.stopPropagation(); addToCart(${p.id})"
            ${p.stock <= 0 ? 'disabled' : ''}
          >
            ${p.stock > 0 ? 'ACQUIRE' : 'GONE'}
          </button>

          ${
            isAdmin
              ? `
                <button
                  onclick="event.stopPropagation(); adminDeleteProduct(${p.id})"
                  class="delete-btn"
                >
                  DELETE
                </button>
              `
              : ''
          }

        </div>
      </div>

      <div class="product-record">
        <span>
          RECORD ${catalogueNumber}
        </span>

        <span>
          ${
            p.stock > 0
              ? `${p.stock} REMAINING`
              : 'NO LONGER IN VAULT'
          }
        </span>
      </div>

    </div>
  `;

  // Make the entire treasure card clickable
  el.onclick = function () {
    openProduct(p.id);
  };

  el.setAttribute(
    'title',
    'Examine this treasure'
  );

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

// =========================================================
// TREASURE COLLECTION NAVIGATION
// =========================================================

function initTreasureCollection() {

  const track = document.getElementById('collection-track');
  const windowEl = document.getElementById('collection-window');
  const prevButton = document.getElementById('collection-prev');
  const nextButton = document.getElementById('collection-next');

  if (!track || !windowEl || !prevButton || !nextButton) {
    return;
  }

  let position = 0;

  const scrollAmount = 220;


  // -------------------------------------------------------
  // UPDATE SLIDER
  // -------------------------------------------------------

  function updateSlider() {

    const maxPosition =
      Math.max(
        0,
        track.scrollWidth - windowEl.clientWidth
      );

    position =
      Math.max(
        0,
        Math.min(position, maxPosition)
      );

    track.style.transform =
      `translateX(-${position}px)`;


    // LEFT ARROW

    prevButton.disabled =
      position <= 0;


    // RIGHT ARROW

    nextButton.disabled =
      position >= maxPosition;


    prevButton.style.opacity =
      prevButton.disabled ? '0.35' : '1';

    nextButton.style.opacity =
      nextButton.disabled ? '0.35' : '1';

  }


  // -------------------------------------------------------
  // PREVIOUS
  // -------------------------------------------------------

  prevButton.onclick = function () {

    position -= scrollAmount;

    updateSlider();

  };


  // -------------------------------------------------------
  // NEXT
  // -------------------------------------------------------

  nextButton.onclick = function () {

    position += scrollAmount;

    updateSlider();

  };


  // -------------------------------------------------------
  // CATEGORY SELECTION
  // -------------------------------------------------------

  const categories =
    document.querySelectorAll('.collection-item');


  categories.forEach(category => {

    category.onclick = function () {

      categories.forEach(item => {
        item.classList.remove('active');
      });

      category.classList.add('active');

      console.log(
        'Selected collection:',
        category.dataset.category
      );

    };

  });


  // -------------------------------------------------------
  // INITIALISE
  // -------------------------------------------------------

  updateSlider();


  // -------------------------------------------------------
  // RESIZE
  // -------------------------------------------------------

  window.addEventListener('resize', updateSlider);

}


// ---------------------------------------------------------
// START COLLECTION NAVIGATION
// ---------------------------------------------------------

if (document.readyState === 'loading') {

  document.addEventListener(
    'DOMContentLoaded',
    initTreasureCollection
  );

} else {

  initTreasureCollection();

}

async function openProduct(productId) {
  try {
    const res = await fetch('/api/products');

    if (!res.ok) {
      throw new Error('Could not load products');
    }

    const products = await res.json();

    const product = products.find(
      p => Number(p.id) === Number(productId)
    );

    if (!product) {
      alert('This treasure could not be found.');
      return;
    }

    // Catalogue number
    const productIndex = products.findIndex(
      p => Number(p.id) === Number(productId)
    );

    const catalogueNumber =
      String(productIndex + 1).padStart(3, '0');

    // Basic product information
    $id('examination-number').textContent =
      `CAT. ${catalogueNumber}`;

    $id('examination-record-number').textContent =
      catalogueNumber;

    $id('examination-name').textContent =
      product.name || 'Unknown Treasure';

    $id('examination-description').textContent =
      product.description ||
      'The merchant has recorded no description for this particular treasure.';

    $id('examination-price').textContent =
      fmtPrice(product.price);

    // Stock
    const stock = Number(product.stock || 0);

    $id('examination-stock').textContent =
      stock > 0 ? stock : 'NONE REMAINING';

    // Status
    const status =
      stock > 0 ? 'AVAILABLE' : 'UNAVAILABLE';

    $id('examination-status').textContent =
      status;

    $id('examination-record-status').textContent =
      stock > 0 ? 'AVAILABLE' : 'UNAVAILABLE';

    // Product image
    const imageContainer =
      $id('examination-image');

    if (product.image_url) {
      imageContainer.innerHTML = `
        <img
          src="${product.image_url}"
          alt="${product.name || 'Treasure'}"
        >
      `;
    } else {
      imageContainer.innerHTML = `
        <div class="no-image-symbol">◈</div>
        <span class="examination-no-image-text">
          IMAGE UNRECORDED
        </span>
      `;
    }

    // Acquire button
    const acquireButton =
      $id('examination-acquire');

    acquireButton.disabled = stock <= 0;

    acquireButton.textContent =
      stock > 0
        ? 'Acquire Treasure'
        : 'Treasure Unavailable';

    acquireButton.onclick = function () {
      if (stock > 0) {
        addToCart(product.id);
      }
    };

    // Open examination page
    showSection('product-examination');

  } catch (error) {
    console.error(
      'Error opening product:',
      error
    );

    alert(
      'The merchant could not retrieve this treasure.'
    );
  }
}

/* =========================================
   TREASURY SEARCH
   ========================================= */

function initTreasureSearch() {
  const input = document.getElementById(
    'treasure-search-input'
  );

  const button = document.getElementById(
    'treasure-search-button'
  );

  if (!input || !button) {
    return;
  }

  function performSearch() {
    const searchTerm =
      input.value.trim().toLowerCase();

    const products =
      document.querySelectorAll('#products-list .product');

    let visibleCount = 0;

    products.forEach(product => {
      const text =
        product.textContent.toLowerCase();

      const matches =
        searchTerm === '' ||
        text.includes(searchTerm);

      product.style.display =
        matches ? '' : 'none';

      if (matches) {
        visibleCount++;
      }
    });

    const emptyMessage =
      document.getElementById('collection-empty');

    if (emptyMessage) {
      emptyMessage.style.display =
        visibleCount === 0 ? '' : 'none';
    }

    const count =
      document.getElementById('collection-count');

    if (count) {
      if (searchTerm === '') {
        count.textContent =
          'THE COMPLETE COLLECTION';
      } else {
        count.textContent =
          `${visibleCount} TREASURE${visibleCount === 1 ? '' : 'S'} FOUND`;
      }
    }
  }

  button.addEventListener(
    'click',
    performSearch
  );

  input.addEventListener(
    'keydown',
    event => {
      if (event.key === 'Enter') {
        performSearch();
      }
    }
  );

  input.addEventListener(
    'input',
    performSearch
  );
}

if (document.readyState === 'loading') {
  document.addEventListener(
    'DOMContentLoaded',
    initTreasureSearch
  );
} else {
  initTreasureSearch();
}
