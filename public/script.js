const state={products:[],user:null,isAdmin:false,category:'all',search:'',newOnly:false};
const $=id=>document.getElementById(id);

// Store pricing is kept in one base currency. Customer-facing formatting can be
// expanded later without changing product prices in the database.
const STORE_CURRENCY='EUR';
const STORE_LOCALE='nl-NL';
const money=v=>new Intl.NumberFormat(STORE_LOCALE,{style:'currency',currency:STORE_CURRENCY}).format(Number(v||0));
const slug=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const pagePaths=new Set(['/','/new-arrivals','/ledger','/merchant','/faq','/contact','/shipping','/returns','/privacy','/terms','/withdrawal','/accessibility']);

const curatedImages=[
  {keys:['veil','darkness','cloth'],src:'/assets/vault-veil.jpg'},
  {keys:['lantern','lamp'],src:'/assets/mariner-lantern.jpg'},
  {keys:['box','chest','crate'],src:'/assets/sealed-box.jpg'},
  {keys:['whispering','bottle','potion','vial'],src:'/assets/whispering-bottle.jpg'},
  {keys:['spoon'],src:'/assets/big-spoon.jpg'},
  {keys:['fork'],src:'/assets/big-fork.jpg'},
  {keys:['wand','staff','rod','sceptre','scepter'],src:'/assets/arcane-wand.jpg'},
  {keys:['compass','orb','astrolabe','curio'],src:'/assets/astral-compass.jpg'}
];
function curatedImage(p){if(p.image_url)return p.image_url;const n=String(p.name||'').toLowerCase();const hit=curatedImages.find(x=>x.keys.some(k=>n.includes(k)));return hit?.src||null;}
function show(view){['home-view','content-view','product-view','auth-view','cart-view','admin-view','order-view'].forEach(id=>$(id)?.classList.toggle('hidden',id!==view));window.scrollTo({top:0,behavior:'smooth'});}
function productUrl(p){return `/product/${p.slug||slug(p.name)}-${p.id}`;}
function placeholder(p){return `<div class="placeholder"><div><span class="placeholder-glyph">✧</span><br><br>${escapeHtml(p.name||'UNCATALOGUED TREASURE')}<br><small>ARTIFACT IMAGE BEING PREPARED</small></div></div>`;}
function imageMarkup(p,detail=false){
  const explicit=String(p.image_url||'').trim();
  const curated=curatedImages.find(x=>x.keys.some(k=>String(p.name||'').toLowerCase().includes(k)))?.src||null;
  const src=explicit||curated;
  if(!src)return placeholder(p);
  const fallback=explicit&&curated&&explicit!==curated?curated:'';
  return `<img src="${escapeAttr(src)}" alt="${escapeAttr(p.name)}" loading="${detail?'eager':'lazy'}" data-image-fallback="${escapeAttr(fallback)}">`;
}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
function escapeAttr(s){return escapeHtml(s);}
function badgeFor(p,i){const n=String(p.name||'').toLowerCase();if(n.includes('whisper')||n.includes('cursed'))return ['CURSED','cursed'];if(n.includes('box')||n.includes('mystery'))return ['UNKNOWN',''];if(p.is_new_arrival)return ['NEW',''];if(p.rarity)return [String(p.rarity).toUpperCase(),''];return i===0?['DISCOVERY','']:['ARTIFACT',''];}
function card(p,i){const [badge,klass]=badgeFor(p,i);return `<article class="product-card" data-product-url="${productUrl(p)}" tabindex="0"><div class="product-image">${imageMarkup(p)}<span class="badge ${klass}">${badge}</span></div><div class="product-info"><h3>${escapeHtml(p.name)}</h3><p>${t("classification","Classification")}: ${escapeHtml(p.category||'Unknown Artifact')}</p><p>${t("origin","Origin")}: ${escapeHtml(p.origin||'Unknown')}</p><div class="product-meta"><span class="price">${money(p.price)}</span><span class="card-link">${t("viewArtifact","VIEW ARTIFACT")} →</span></div></div></article>`;}
function filteredProducts(){return state.products.filter(p=>{const cat=(p.category||'').toLowerCase();const catOK=state.category==='all'||cat.includes(state.category)||(state.category==='mystery'&&((p.name||'').toLowerCase().includes('box')));const q=state.search.trim().toLowerCase();const searchOK=!q||`${p.name} ${p.description} ${p.category} ${p.origin||''} ${p.rarity||''}`.toLowerCase().includes(q);return catOK&&searchOK;});}
function renderProducts(limitHome=false){let list=filteredProducts();const kicker=$('treasure-kicker'),title=$('treasure-title');if(kicker&&title){if(state.search){kicker.textContent='SEARCH RESULTS';title.textContent='TREASURES FOUND';}else if(state.newOnly){kicker.textContent=t('recentlyCatalogued','RECENTLY CATALOGUED');title.textContent=t('newArrivalsTitle','NEW ARRIVALS');}else if(state.category!=='all'){const labels={artifacts:t('artifacts','ARTIFACTS'),collectibles:t('collectibles','COLLECTIBLES'),oddities:t('oddities','ODDITIES'),mystery:t('mysteryBoxes','MYSTERY BOXES')};kicker.textContent='CATALOGUE';title.textContent=labels[state.category]||'TREASURES';}else if(limitHome){kicker.textContent=t('recentlyDiscovered','RECENTLY DISCOVERED');title.textContent=t('featuredTreasures','FEATURED TREASURES');}else{kicker.textContent=t('completeCollection','COMPLETE COLLECTION');title.textContent=t('allTreasures','ALL TREASURES');}}if(limitHome&&!state.search&&!state.newOnly&&state.category==='all'){list=[...list].sort((a,b)=>Number(b.is_featured)-Number(a.is_featured)||Number(b.is_new_arrival)-Number(a.is_new_arrival)||Number(b.id)-Number(a.id));list=list.slice(0,4);}$('products-list').innerHTML=list.length?list.map(card).join(''):`<div class="empty-state">${t('noTreasures','No treasures were found in the current catalogue.')}</div>`;$('result-count').textContent=`${list.length} treasure${list.length===1?'':'s'} discovered`;$('clear-filter').classList.toggle('hidden',!(state.category!=='all'||state.search||state.newOnly));}
async function loadProducts(){const r=await fetch('/api/products');state.products=r.ok?await r.json():[];renderProducts();}
async function renderProductFromPath(){const path=location.pathname;if(!path.startsWith('/product/'))return;const key=decodeURIComponent(path.split('/product/')[1]);show('product-view');$('product-view').innerHTML='<div class="panel-inner"><p class="eyebrow">THE ARCHIVES</p><h2>Retrieving treasure...</h2></div>';try{const r=await fetch('/api/products/'+encodeURIComponent(key));if(!r.ok)throw new Error('not found');const p=await r.json();$('product-view').innerHTML=`<div class="product-detail"><div class="detail-image">${imageMarkup(p,true)}</div><div class="detail-copy"><span class="badge">${escapeHtml(p.category||'ARTIFACT')}</span><h1>${escapeHtml(p.name)}</h1><p class="eyebrow">CATALOGUE NO. ${p.id}</p><div class="detail-price">${money(p.price)}</div><p class="detail-description">${escapeHtml(p.description||'A treasure whose history has yet to be fully uncovered.')}</p><div class="spec-list"><div><strong>CLASSIFICATION</strong><span>${escapeHtml(p.category||'Unknown Artifact')}</span></div><div><strong>ORIGIN</strong><span>${escapeHtml(p.origin||'Unknown')}</span></div><div><strong>RARITY</strong><span>${escapeHtml(p.rarity||'Unclassified')}</span></div><div><strong>CONDITION</strong><span>${escapeHtml(p.condition||'Not recorded')}</span></div><div><strong>PROVENANCE</strong><span>${escapeHtml(p.provenance||'Unknown')}</span></div><div><strong>AVAILABILITY</strong><span>${Number(p.stock)>0?`${p.stock} in the vault`:'Currently unavailable'}</span></div></div><button class="ornate-btn" data-add-to-cart="${p.id}" ${Number(p.stock)<=0?'disabled':''}>✧ &nbsp; ADD TO CART</button><div class="share-row"><button class="copy-link" data-copy-link>COPY DIRECT TREASURE LINK</button></div></div></div><div class="related"><div class="section-heading"><div class="line"></div><div><p>OTHER DISCOVERIES</p><h2>YOU MAY ALSO FIND</h2></div><div class="line"></div></div><div class="product-grid">${state.products.filter(x=>x.id!==p.id).slice(0,4).map(card).join('')}</div></div>`;document.title=`${p.name} — FLIGALIGA`;window.scrollTo(0,0);}catch(e){$('product-view').innerHTML='<div class="panel-inner"><p class="eyebrow">THE ARCHIVES</p><h2>Treasure not found</h2><a class="ornate-btn" href="/">RETURN TO THE VAULT</a></div>';}}
function copyProductLink(){navigator.clipboard?.writeText(location.href);alert('Direct treasure link copied.');}
function setActiveNav(path){document.querySelectorAll('.main-nav a[data-page]').forEach(a=>a.classList.toggle('active',a.getAttribute('href')===path));}
const pageData={
  '/ledger':{kicker:'THE ARCHIVE',title:'THE LEDGER',intro:'A record of expeditions, discoveries and treasures that have passed through the Vault.',blocks:[['Recent discoveries','Every catalogue entry begins as a story: where it was found, what is known about it, and what remains a mystery.'],['The catalogue','Browse the current collection through Treasures, New Arrivals and the individual artifact pages. Each product has its own shareable archive address.'],['A note from the merchant','The Ledger is intentionally incomplete. Some provenance is lost, some details are disputed, and some treasures are simply better left unexplained.']]},
  '/merchant':{kicker:'THE ONE WHO KEEPS THE VAULT',title:'ABOUT THE MERCHANT',intro:'Welcome, traveller. The Vault is a fictionalized antique-curiosity shop concept built around the idea that every object deserves a story.',blocks:[['The philosophy','FLIGALIGA treats the shop as part catalogue, part expedition journal. The visual language is deliberately old-world: brass, parchment, candlelight and deep shadow.'],['What we collect','Artifacts, curiosities, nautical relics, oddities and objects with an unusual history — real, imagined, or still waiting to be uncovered.'],['The fine print','Replace this story with your real business story, company details and contact information before launch. Dutch online shops must clearly identify the business and provide contact details.']]},
  '/faq':{kicker:'QUESTIONS FROM THE ROAD',title:'FREQUENTLY ASKED QUESTIONS',intro:'A starting FAQ for the Vault. Product-specific answers should always override these general notes.',faq:true},
  '/contact':{kicker:'THE MERCHANT’S OFFICE',title:'CONTACT THE MERCHANT',intro:'Questions about a treasure, an order or the expedition? This page is ready for your real contact details.',contact:true},
  '/shipping':{kicker:'THE EXPEDITION',title:'SHIPPING & DELIVERY',intro:'Draft storefront copy — replace the placeholder carrier, price and delivery details with your actual shipping policy before launch.',blocks:[['Dispatch','Orders are prepared after payment and handed to the selected carrier according to the delivery method shown at checkout.'],['Delivery estimates','Show the expected delivery time and shipping cost before the customer places the order. Keep the actual carrier, service level and rates here once configured.'],['Tracking','When tracking is available, the order confirmation should contain the tracking link or reference.'],['International orders','If you later ship outside the Netherlands, add the countries served, shipping costs, duties and any applicable delivery restrictions.']]},
  '/returns':{kicker:'THE RETURN VOYAGE',title:'RETURNS & WITHDRAWAL',intro:'This page is a practical draft, not a substitute for checking your final terms against Dutch consumer law.',blocks:[['14-day withdrawal','For many online consumer purchases in the EU, buyers have a 14-day withdrawal period. There are exceptions, so the final policy should be checked against the products you actually sell.'],['Return costs','If customers bear return shipping costs, tell them clearly before purchase. The final policy should also state the return address and the procedure.'],['Defective or incorrect items','Add your actual process for damaged, defective or incorrectly supplied treasures, including how customers should contact you.'],['Before launch','Replace this draft with your final return policy, withdrawal form and — for a Dutch webshop — the required online cancellation flow.']]},
  '/privacy':{kicker:'THE PRIVATE LEDGER',title:'PRIVACY',intro:'PLACEHOLDER — replace with the final privacy notice before launch.',blocks:[['Business identity','[PLACEHOLDER — registered business name, address, email, phone, KvK and VAT details]'],['Personal data','[PLACEHOLDER — accounts, orders, support, payment and delivery data actually collected]'],['Legal bases','[PLACEHOLDER — GDPR legal basis for each processing purpose]'],['Processors','[PLACEHOLDER — hosting, database, payment, delivery, email and analytics providers]'],['Retention & rights','[PLACEHOLDER — retention periods and how customers exercise their rights]'],['Cookies','[PLACEHOLDER — actual cookies/analytics and consent mechanism]']]},
  '/terms':{kicker:'THE MERCHANT’S TERMS',title:'GENERAL TERMS & CONDITIONS',intro:'PLACEHOLDER — replace with the final consumer terms before launch.',blocks:[['Business details','[PLACEHOLDER — registered name, address, KvK, VAT, email and phone]'],['Products & prices','[PLACEHOLDER — product characteristics, VAT-inclusive prices and extra costs]'],['Ordering & payment','[PLACEHOLDER — ordering steps, payment methods and contract formation]'],['Delivery','[PLACEHOLDER — countries served, carrier, costs, delivery estimates and delays]'],['Legal guarantee & complaints','[PLACEHOLDER — statutory conformity rights and complaints procedure]'],['Other terms','[PLACEHOLDER — final terms for your actual business model]']]},
  '/withdrawal':{kicker:'THE RETURN VOYAGE',title:'WITHDRAWAL & CANCELLATION',intro:'PLACEHOLDER — complete the final withdrawal policy and cancellation process before accepting consumer orders.',blocks:[['Withdrawal period','[PLACEHOLDER — applicable statutory withdrawal period and product-specific exceptions]'],['Online cancellation','Use the cancellation function below to start a withdrawal request. [PLACEHOLDER — connect the final account/order records before launch.]'],['Returns','[PLACEHOLDER — return address, return costs, packaging guidance and refund process]'],['Model form','[PLACEHOLDER — provide the statutory model withdrawal form]']]},
  '/accessibility':{kicker:'ACCESS FOR EVERY TRAVELLER',title:'ACCESSIBILITY STATEMENT',intro:'PLACEHOLDER — replace with the final accessibility statement and contact route.',blocks:[['Accessibility commitment','[PLACEHOLDER — accessibility status of the finished webshop]'],['Known limitations','[PLACEHOLDER — known issues and planned remediation]'],['Feedback','[PLACEHOLDER — accessible contact method for accessibility feedback]'],['Technical information','[PLACEHOLDER — technologies, standards, test method and date]']]}
};
function renderPage(path){if(path==='/treasures'||path==='/new-arrivals')return renderCataloguePage(path);const d=pageData[path];if(!d)return renderHome();setActiveNav(path);show('content-view');let html=`<div class="page-hero"><p class="eyebrow">${d.kicker}</p><h1>${d.title}</h1><p>${d.intro}</p></div>`;if(d.faq)html+=faqHtml();else if(d.contact)html+=contactHtml();else html+=`<div class="info-grid">${d.blocks.map(([h,t])=>`<article><h3>${h}</h3><p>${t}</p></article>`).join('')}</div>`;$('content-view').innerHTML=html;document.title=`${d.title} — FLIGALIGA`;}
function faqHtml(){const items=[['How do I find a specific treasure?','Use the search field, browse the Treasures page, or open a product’s direct archive link.'],['Can I share a product directly?','Yes. Every treasure has its own URL, so you can copy the address from the product page and send it directly.'],['How long does delivery take?','Delivery times are currently placeholder content. Add your real carrier, dispatch time and delivery estimate before launch.'],['Can I return an online purchase?','For many EU online purchases, consumers have a 14-day withdrawal period, subject to exceptions. See the Returns page for the draft policy.'],['How do I contact the merchant?','Use the Contact page. Add your real email address and telephone details before the shop goes live.'],['Are the treasures authentic?','Use this answer for your real sourcing and authenticity policy. Each product page should clearly describe what is known about the item.']];return `<div class="faq-list">${items.map(([q,a])=>`<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>`;}
function contactHtml(){return `<div class="contact-layout"><div class="contact-card"><p class="eyebrow">REACH THE VAULT</p><h3>CONTACT DETAILS</h3><p class="placeholder-copy">[PLACEHOLDER — replace with real business information before launch.]</p><ul><li><strong>EMAIL</strong><span>[PLACEHOLDER — business email]</span></li><li><strong>TELEPHONE</strong><span>[PLACEHOLDER — business phone]</span></li><li><strong>ADDRESS</strong><span>[PLACEHOLDER — registered business address]</span></li><li><strong>KVK</strong><span>[PLACEHOLDER — KvK number]</span></li><li><strong>VAT</strong><span>[PLACEHOLDER — VAT ID, if applicable]</span></li><li><strong>REACHABILITY</strong><span>[PLACEHOLDER — support hours]</span></li></ul></div><div class="contact-card"><p class="eyebrow">SEND A MESSAGE</p><h3>CONTACT FORM</h3><p class="muted-note">[PLACEHOLDER — connect this form to your chosen support/email service before launch.]</p><button class="ghost-btn" type="button" disabled>CONTACT FORM NOT YET CONNECTED</button></div></div>`;}
function renderCataloguePage(path){show('content-view');setActiveNav(path);const isNew=path==='/new-arrivals';state.newOnly=isNew;state.category='all';state.search=new URLSearchParams(location.search).get('q')||'';$('content-view').innerHTML=`<div class="catalogue-page"><div class="page-hero compact"><p class="eyebrow">${isNew?t('recentlyCatalogued','RECENTLY CATALOGUED'):t('completeCollection','THE COMPLETE COLLECTION')}</p><h1>${isNew?t('newArrivalsTitle','NEW ARRIVALS'):t('treasuresTitle','TREASURES')}</h1><p>${isNew?t('latestDiscoveries','The latest discoveries to enter the Vault.'):t('browseCatalogue','Browse the full catalogue of artifacts, curiosities, oddities and mysteries.')}</p></div><div class="catalogue-tools"><button class="ghost-btn" data-navigate="/">← ${t('vault','THE VAULT')}</button><span id="catalogue-count"></span></div><div id="catalogue-products" class="product-grid"></div></div>`;const list=state.products.filter(p=>{const q=state.search.toLowerCase();const matches=!q||`${p.name} ${p.description} ${p.category} ${p.origin} ${p.rarity}`.toLowerCase().includes(q);return matches&&(!isNew||p.is_new_arrival);});$('catalogue-products').innerHTML=list.length?list.map(card).join(''):`<div class="empty-state">${t('noTreasures','No treasures are currently catalogued.')}</div>`;$('catalogue-count').textContent=`${list.length} ${list.length===1?t('discoverySingular','discovery'):t('discoveryPlural','discoveries')} ${t('inView','in view')}`;document.title=`${isNew?t('newArrivalsTitle','New Arrivals'):t('treasuresTitle','Treasures')} — FLIGALIGA`;}
function renderHome(){state.newOnly=false;state.category='all';state.search=new URLSearchParams(location.search).get('q')||'';if($('search-input'))$('search-input').value=state.search;setActiveNav('/');show('home-view');document.title='FLIGALIGA — The Vault';renderProducts(true);}
function navigate(path){history.pushState({},'',path);route();}
function route(){const path=location.pathname;if(path.startsWith('/product/'))return renderProductFromPath();if(path==='/')return renderHome();if(path==='/treasures'){navigate('/');return;}if(pagePaths.has(path))return renderPage(path);return renderPage('/faq');}
async function me(){const r=await fetch('/api/me');state.user=r.ok?await r.json():null;state.isAdmin=!!state.user?.isAdmin;$('login-link').classList.toggle('hidden',!!state.user);$('logout-btn').classList.toggle('hidden',!state.user);$('admin-link').classList.toggle('hidden',!state.isAdmin);}
async function loadCart(){const r=await fetch('/api/cart');if(!r.ok){$('cart-count').textContent='0';$('cart-list').innerHTML='<p class="muted-note">Enter the Vault to view your ledger.</p>';$('cart-total').textContent=money(0);return}const items=await r.json();$('cart-count').textContent=items.reduce((n,i)=>n+Number(i.quantity),0);$('cart-list').innerHTML=items.length?items.map(i=>`<div class="cart-row"><div><strong>${escapeHtml(i.name)}</strong><br><span>${money(i.price)} each</span></div><div class="qty"><button data-cart-id="${i.id}" data-cart-qty="${i.quantity-1}">−</button><span>${i.quantity}</span><button data-cart-id="${i.id}" data-cart-qty="${i.quantity+1}">+</button></div><strong>${money(Number(i.price)*i.quantity)}</strong></div>`).join(''):'<p>Your ledger is empty.</p>';$('cart-total').textContent=money(items.reduce((n,i)=>n+Number(i.price)*Number(i.quantity),0));}
async function addToCart(id){if(!state.user){show('auth-view');return}const r=await fetch('/api/cart',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product_id:id})});if(r.ok){await loadCart();alert('Treasure added to your ledger.')}else alert(await r.text());}
async function updateCart(id,q){const r=await fetch('/api/cart/update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,quantity:q})});if(!r.ok)alert(await r.text());await loadCart();}
async function login(e){e.preventDefault();const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:$('login-user').value.trim(),password:$('login-pass').value})});if(!r.ok)return alert(await r.text());await me();await loadCart();navigate('/');}
async function register(e){e.preventDefault();const r=await fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:$('reg-user').value.trim(),password:$('reg-pass').value})});if(!r.ok)return alert(await r.text());alert('Account created. You may now enter the vault.');$('reg-user').value='';$('reg-pass').value='';}
async function logout(){await fetch('/api/logout',{method:'POST'});await me();await loadCart();navigate('/');}
function openCheckout(){if(!state.user){show('auth-view');return}const items=document.querySelectorAll('.cart-row');if(!items.length){$('checkout-message').textContent='Your ledger is empty.';return}$('checkout-panel').classList.remove('hidden');$('checkout-name').focus();}
async function checkout(e){e.preventDefault();$('checkout-message').textContent='';const body={customer_name:$('checkout-name').value.trim(),customer_email:$('checkout-email').value.trim(),shipping_address_line1:$('checkout-address').value.trim(),shipping_postcode:$('checkout-postcode').value.trim(),shipping_city:$('checkout-city').value.trim(),shipping_country:$('checkout-country').value.trim().toUpperCase(),accept_terms:$('checkout-terms').checked};const r=await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok){$('checkout-message').textContent=d.error||'Checkout failed.';return}if(d.checkoutUrl){window.location.href=d.checkoutUrl;return}$('checkout-message').textContent='Payment could not be started.';}
async function emptyCart(){if(!confirm('Empty your cart?'))return;await fetch('/api/cart/empty',{method:'POST'});await loadCart();}
async function loadOrders(){if(!state.isAdmin)return;const r=await fetch('/api/admin/orders');if(!r.ok)return;$('admin-orders').innerHTML=(await r.json()).map(o=>`<div class="admin-order"><strong>Order #${o.id}</strong> — ${escapeHtml(o.username)} — ${money(o.total)}<br>${o.items.map(i=>`${escapeHtml(i.name)} × ${i.quantity}`).join(', ')}</div>`).join('')||'<p>No orders yet.</p>';}
async function adminAdd(e){e.preventDefault();const body={name:$('prod-name').value.trim(),description:$('prod-description').value.trim(),price:Number($('prod-price').value),stock:Number($('prod-stock').value),image_url:$('prod-image').value.trim()||null,category:$('prod-category').value.trim()||'Artifacts',rarity:$('prod-rarity').value.trim()||null,origin:$('prod-origin').value.trim()||null,condition:$('prod-condition').value.trim()||null,provenance:$('prod-provenance').value.trim()||null,is_featured:$('prod-featured').checked,is_new_arrival:$('prod-new').checked};const r=await fetch('/api/admin/product',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)return alert(await r.text());e.target.reset();await loadProducts();await loadOrders();alert('Treasure catalogued.');}
function applySearchFromUrl(){const q=new URLSearchParams(location.search);state.search=q.get('q')||'';if($('search-input'))$('search-input').value=state.search;}
document.addEventListener('click',e=>{const nav=e.target.closest('[data-navigate]');if(nav){navigate(nav.dataset.navigate);return;}const homeScroll=e.target.closest('[data-home-scroll]');if(homeScroll){if(location.pathname==='/'){history.replaceState({},'', '/#'+homeScroll.dataset.homeScroll);document.getElementById(homeScroll.dataset.homeScroll)?.scrollIntoView({behavior:'smooth'});}else{navigate('/#'+homeScroll.dataset.homeScroll);}return;}const add=e.target.closest('[data-add-to-cart]');if(add){addToCart(Number(add.dataset.addToCart));return;}const qty=e.target.closest('[data-cart-id]');if(qty){updateCart(Number(qty.dataset.cartId),Number(qty.dataset.cartQty));return;}const copy=e.target.closest('[data-copy-link]');if(copy){copyProductLink();return;}const cardEl=e.target.closest('.product-card');if(cardEl){navigate(cardEl.dataset.productUrl);}});document.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const cardEl=e.target.closest('.product-card');if(cardEl){navigate(cardEl.dataset.productUrl);}}});document.addEventListener('submit',e=>{if(e.target.matches('.contact-form')){e.preventDefault();alert('Contact form placeholder — connect this form to your email service before launch.');}});document.addEventListener('error',e=>{
  if(!e.target?.matches?.('[data-image-fallback]'))return;
  const img=e.target;
  const fallback=img.dataset.imageFallback;
  if(fallback){
    img.dataset.imageFallback='';
    img.src=fallback;
    return;
  }
  const wrapper=img.parentElement;
  if(wrapper)wrapper.innerHTML=placeholder({name:img.alt||'UNCATALOGUED TREASURE'});
},true);window.addEventListener('popstate',route);
function applyLanguage(){
  const lang = localStorage.getItem('fligaliga-language') || 'en';
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (translations[lang]?.[key] !== undefined) el.innerHTML = translations[lang][key];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    if (translations[lang]?.[key] !== undefined) el.placeholder = translations[lang][key];
  });
  const toggle = $('language-toggle');
  if (toggle) {
    toggle.textContent = lang === 'en' ? 'NL' : 'EN';
    toggle.title = lang === 'en' ? 'Switch to Dutch' : 'Switch to English';
    toggle.setAttribute('aria-label', toggle.title);
  }
}

function applyTheme(){
  const theme = localStorage.getItem('fligaliga-theme') || 'dark';
  document.documentElement.dataset.theme = theme;
  const toggle = $('theme-toggle');
  if (toggle) {
    toggle.textContent = theme === 'dark' ? '☀' : '☾';
    toggle.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    toggle.setAttribute('aria-label', toggle.title);
  }
}

const translations = {
  en: {
    navVault:'THE VAULT',navTreasures:'TREASURES',navNew:'NEW ARRIVALS',navLedger:'THE LEDGER',navMerchant:'ABOUT THE MERCHANT',
    searchPlaceholder:'Search treasures...',admin:'ADMIN',enter:'ENTER',leave:'LEAVE',welcomeTo:'WELCOME TO',vault:'THE VAULT',
    heroSub:'Treasures collected from places<br>better left forgotten.',enterVault:'ENTER THE VAULT',allTreasures:'ALL TREASURES',
    artifacts:'ARTIFACTS',collectibles:'COLLECTIBLES',oddities:'ODDITIES',mysteryBoxes:'MYSTERY BOXES',
    recentlyDiscovered:'RECENTLY DISCOVERED',featuredTreasures:'FEATURED TREASURES',clearFilter:'CLEAR FILTER ×',
    fastShipping:'FAST & SECURE SHIPPING',shippingSub:'Your treasures, safely delivered.',secureReturns:'SECURE RETURNS',
    returnsSub:'A clear path when plans change.',uniqueAuthentic:'UNIQUE & AUTHENTIC',uniqueSub:'Each item has a story.',
    contactMerchant:'CONTACT THE MERCHANT',contactSub:"Have a question? We're here.",merchantOffice:"THE MERCHANT'S OFFICE",
    enterTheVault:'ENTER THE VAULT',returningTraveler:'RETURNING TRAVELER',newArrival:'NEW ARRIVAL',
    username:'Username',password:'Password',chooseUsername:'Choose a username',choosePassword:'Choose a password',
    yourLedger:'YOUR LEDGER',deliveryDetails:'DELIVERY DETAILS',completeOrder:'COMPLETE YOUR ORDER',placeOrder:'PLACE ORDER',
    cancel:'CANCEL',merchant:'THE MERCHANT',adminLedger:'ADMIN LEDGER',addTreasure:'ADD TREASURE',orders:'ORDERS',
    cart:'THE CART',emptyCart:'EMPTY CART',checkout:'CHECKOUT',footerTagline:'Some treasures are not meant to be found...',classification:'Classification',origin:'Origin',viewArtifact:'VIEW ARTIFACT',recentlyCatalogued:'RECENTLY CATALOGUED',completeCollection:'THE COMPLETE COLLECTION',newArrivalsTitle:'NEW ARRIVALS',treasuresTitle:'TREASURES',latestDiscoveries:'The latest discoveries to enter the Vault.',browseCatalogue:'Browse the full catalogue of artifacts, curiosities, oddities and mysteries.',noTreasures:'No treasures are currently catalogued.',discoverySingular:'discovery',discoveryPlural:'discoveries',inView:'in view'
  },
  nl: {
    navVault:'DE KLUIS',navTreasures:'SCHATTEN',navNew:'NIEUW BINNEN',navLedger:'HET GROOTBOEK',navMerchant:'OVER DE HANDELAAR',
    searchPlaceholder:'Zoek schatten...',admin:'BEHEER',enter:'BINNENKOMEN',leave:'VERLATEN',welcomeTo:'WELKOM BIJ',vault:'DE KLUIS',
    heroSub:'Schatten verzameld van plaatsen<br>die beter vergeten hadden kunnen blijven.',enterVault:'BETREED DE KLUIS',allTreasures:'ALLE SCHATTEN',
    artifacts:'ARTEFACTEN',collectibles:'VERZAMELOBJECTEN',oddities:'RARITEITEN',mysteryBoxes:'MYSTERYBOXEN',
    recentlyDiscovered:'RECENT ONTDEKT',featuredTreasures:'UITGELICHTE SCHATTEN',clearFilter:'FILTER WISSEN ×',
    fastShipping:'SNEL & VEILIG VERZONDEN',shippingSub:'Je schatten veilig bij je thuis.',secureReturns:'VEILIG RETOURNEREN',
    returnsSub:'Een duidelijk pad als plannen veranderen.',uniqueAuthentic:'UNIEK & AUTHENTIEK',uniqueSub:'Elk voorwerp heeft een verhaal.',
    contactMerchant:'CONTACT MET DE HANDELAAR',contactSub:'Een vraag? We helpen je graag.',merchantOffice:'HET KANTOOR VAN DE HANDELAAR',
    enterTheVault:'BETREED DE KLUIS',returningTraveler:'TERUGKERENDE BEZOEKER',newArrival:'NIEUWE BEZOEKER',
    username:'Gebruikersnaam',password:'Wachtwoord',chooseUsername:'Kies een gebruikersnaam',choosePassword:'Kies een wachtwoord',
    yourLedger:'JOUW GROOTBOEK',deliveryDetails:'BEZORGGEGEVENS',completeOrder:'BESTELLING AFRONDEN',placeOrder:'BESTELLING PLAATSEN',
    cancel:'ANNULEREN',merchant:'DE HANDELAAR',adminLedger:'BEHEERDER',addTreasure:'SCHAT TOEVOEGEN',orders:'BESTELLINGEN',
    cart:'DE WINKELWAGEN',emptyCart:'WINKELWAGEN LEGEN',checkout:'AFREKENEN',footerTagline:'Sommige schatten zijn niet bedoeld om gevonden te worden...',classification:'Classificatie',origin:'Herkomst',viewArtifact:'BEKIJK ARTEFACT',recentlyCatalogued:'RECENT GECATALOGISEERD',completeCollection:'DE VOLLEDIGE COLLECTIE',newArrivalsTitle:'NIEUW BINNEN',treasuresTitle:'SCHATTEN',latestDiscoveries:'De nieuwste ontdekkingen die de Kluiskamer zijn binnengekomen.',browseCatalogue:'Bekijk de volledige collectie artefacten, curiositeiten, rariteiten en mysteries.',noTreasures:'Er zijn momenteel geen schatten gecatalogiseerd.',discoverySingular:'ontdekking',discoveryPlural:'ontdekkingen',inView:'in beeld'
  }
};

function t(key,fallback=''){const lang=localStorage.getItem('fligaliga-language')||'en';return translations[lang]?.[key]??translations.en?.[key]??fallback;}

document.addEventListener('DOMContentLoaded', async()=>{
  applyTheme();
  applyLanguage();

  $('language-toggle')?.addEventListener('click',()=>{
    const current=localStorage.getItem('fligaliga-language')||'en';
    localStorage.setItem('fligaliga-language',current==='en'?'nl':'en');
    applyLanguage();
    route();
  });

  $('theme-toggle')?.addEventListener('click',()=>{
    const current=localStorage.getItem('fligaliga-theme')||'dark';
    localStorage.setItem('fligaliga-theme',current==='dark'?'light':'dark');
    applyTheme();
  });
await me();await loadProducts();await loadCart();if(state.isAdmin)await loadOrders();applySearchFromUrl();
  $('search-form').addEventListener('submit',e=>{e.preventDefault();const q=$('search-input').value.trim();navigate(q?`/?q=${encodeURIComponent(q)}#treasures`:'/');if(q)document.getElementById('treasures')?.scrollIntoView({behavior:'smooth'});});
  $('search-input').addEventListener('input',e=>{state.search=e.target.value;});
  document.querySelectorAll('[data-category]').forEach(b=>b.addEventListener('click',()=>{state.category=b.dataset.category;state.newOnly=false;renderProducts();document.getElementById('treasures').scrollIntoView({behavior:'smooth'});}));
  $('clear-filter').addEventListener('click',()=>{state.category='all';state.search='';state.newOnly=false;$('search-input').value='';history.replaceState({},'', '/');renderProducts(true);});
  $('enter-vault-btn')?.addEventListener('click',()=>{state.category='all';state.search='';state.newOnly=false;$('search-input').value='';history.replaceState({},'', '/#treasures');renderProducts();document.getElementById('treasures')?.scrollIntoView({behavior:'smooth'});});
  $('login-link').addEventListener('click',()=>show('auth-view'));$('logout-btn').addEventListener('click',logout);$('admin-link').addEventListener('click',async()=>{show('admin-view');await loadOrders();});$('cart-btn').addEventListener('click',()=>state.user?show('cart-view'):show('auth-view'));
  $('login-form').addEventListener('submit',login);$('register-form').addEventListener('submit',register);$('empty-cart').addEventListener('click',emptyCart);$('checkout-btn').addEventListener('click',openCheckout);$('checkout-form').addEventListener('submit',checkout);$('cancel-checkout').addEventListener('click',()=>{$('checkout-panel').classList.add('hidden');$('checkout-message').textContent='';});$('admin-product-form').addEventListener('submit',adminAdd);
  if(location.pathname.startsWith('/product/'))await renderProductFromPath();else route();
  applyLanguage();
});
