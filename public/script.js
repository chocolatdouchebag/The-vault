const state={products:[],adminProducts:[],adminEditingId:null,user:null,isAdmin:false,category:'all',search:'',newOnly:false,catalogueExpanded:false};
const $=id=>document.getElementById(id);

// Store pricing is kept in one base currency. Customer-facing formatting can be
// expanded later without changing product prices in the database.
const STORE_CURRENCY='EUR';
const STORE_LOCALE='nl-NL';
const money=v=>new Intl.NumberFormat(STORE_LOCALE,{style:'currency',currency:STORE_CURRENCY}).format(Number(v||0));
const slug=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const pagePaths=new Set(['/','/new-arrivals','/ledger','/merchant','/faq','/contact','/shipping','/returns','/privacy','/terms','/withdrawal','/accessibility','/payment-result']);

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
let pendingCatalogueScroll=null;
function show(view){['home-view','content-view','product-view','auth-view','cart-view','admin-view','order-view'].forEach(id=>$(id)?.classList.toggle('hidden',id!==view));const restore=pendingCatalogueScroll;pendingCatalogueScroll=null;if(Number.isFinite(restore)){requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo({top:restore,left:0,behavior:'auto'})));}else if(view==='product-view'){window.scrollTo({top:0,left:0,behavior:'auto'});}else{window.scrollTo({top:0,behavior:'smooth'});}}
function scrollToAnchor(id,offset=0){const el=$(id);if(!el)return;const header=document.querySelector('.site-header');const headerHeight=header?.getBoundingClientRect().height||0;const top=Math.max(0,el.getBoundingClientRect().top+window.scrollY-headerHeight-offset);window.scrollTo({top,left:0,behavior:'smooth'});}
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
function badgeFor(p,i){const n=String(p.name||'').toLowerCase();if(n.includes('whisper')||n.includes('cursed'))return [t('badgeCursed','CURSED'),'cursed'];if(n.includes('box')||n.includes('mystery'))return [t('badgeUnknown','UNKNOWN'),''];if(p.is_new_arrival)return [t('badgeNew','NEW'),''];if(p.is_featured)return [t('badgeFeatured','FEATURED'),''];if(p.rarity)return [String(p.rarity).toUpperCase(),''];return i===0?[t('badgeDiscovery','DISCOVERY'),'']:[t('badgeArtifact','ARTIFACT'),''];}
function card(p,i){const [badge,klass]=badgeFor(p,i);return `<article class="product-card" data-product-url="${productUrl(p)}" tabindex="0"><div class="product-image">${imageMarkup(p)}<span class="badge ${klass}">${badge}</span></div><div class="product-info"><h3>${escapeHtml(p.name)}</h3><p>${t("classification","Classification")}: ${escapeHtml(p.category||'Unknown Artifact')}</p><p>${t("origin","Origin")}: ${escapeHtml(p.origin||'Unknown')}</p><div class="product-meta"><span class="price">${money(p.price)}</span><span class="card-link">${t("viewArtifact","VIEW ARTIFACT")} →</span></div></div></article>`;}
function filteredProducts(){return state.products.filter(p=>{const cat=(p.category||'').toLowerCase();const catOK=state.category==='all'||cat.includes(state.category)||(state.category==='mystery'&&((p.name||'').toLowerCase().includes('box')));const q=state.search.trim().toLowerCase();const searchOK=!q||`${p.name} ${p.description} ${p.category} ${p.origin||''} ${p.rarity||''}`.toLowerCase().includes(q);return catOK&&searchOK;});}
function renderProducts(limitHome=false){let list=filteredProducts();const kicker=$('treasure-kicker'),title=$('treasure-title');if(kicker&&title){if(state.search){kicker.textContent=t('searchResults','SEARCH RESULTS');title.textContent=t('treasuresFound','TREASURES FOUND');}else if(state.newOnly){kicker.textContent=t('recentlyCatalogued','RECENTLY CATALOGUED');title.textContent=t('newArrivalsTitle','NEW ARRIVALS');}else if(state.category!=='all'){const labels={artifacts:t('artifacts','ARTIFACTS'),collectibles:t('collectibles','COLLECTIBLES'),oddities:t('oddities','ODDITIES'),mystery:t('mysteryBoxes','MYSTERY BOXES')};kicker.textContent=t('catalogue','CATALOGUE');title.textContent=labels[state.category]||t('treasuresTitle','TREASURES');}else if(limitHome){kicker.textContent=t('recentlyDiscovered','RECENTLY DISCOVERED');title.textContent=t('featuredTreasures','FEATURED TREASURES');}else{kicker.textContent=t('completeCollection','COMPLETE COLLECTION');title.textContent=t('allTreasures','ALL TREASURES');}}if(limitHome&&!state.catalogueExpanded&&!state.search&&!state.newOnly&&state.category==='all'){list=[...list].sort((a,b)=>Number(b.is_featured)-Number(a.is_featured)||Number(b.is_new_arrival)-Number(a.is_new_arrival)||Number(b.id)-Number(a.id));list=list.slice(0,4);}$('products-list').innerHTML=list.length?list.map(card).join(''):`<div class="empty-state">${t('noTreasures','No treasures were found in the current catalogue.')}</div>`;$('result-count').textContent=`${list.length} ${list.length===1?t('treasureSingular','treasure'):t('treasurePlural','treasures')} ${t('discovered','discovered')}`;$('clear-filter').classList.toggle('hidden',!(state.category!=='all'||state.search||state.newOnly));}

async function loadProducts(){const r=await fetch('/api/products');state.products=r.ok?await r.json():[];renderProducts();}
async function renderProductFromPath(){const path=location.pathname;if(!path.startsWith('/product/'))return;const key=decodeURIComponent(path.split('/product/')[1]);pendingCatalogueScroll=null;show('product-view');$('product-view').innerHTML='<div class="panel-inner"><p class="eyebrow">'+t('archives','THE ARCHIVES')+'</p><h2>'+t('retrievingTreasure','Retrieving treasure...')+'</h2></div>';try{const r=await fetch('/api/products/'+encodeURIComponent(key));if(!r.ok)throw new Error('not found');const p=await r.json();trackEcommerceEvent('view_item',{currency:STORE_CURRENCY,value:Number(p.price)||0,items:[ecommerceItem(p)]});$('product-view').innerHTML=['<div class="product-detail"><div class="detail-image">',imageMarkup(p,true),'</div><div class="detail-copy"><span class="badge">',escapeHtml(p.category||t('artifact','ARTIFACT')),'</span><h1>',escapeHtml(p.name),'</h1><p class="eyebrow">',t('catalogueNumber','CATALOGUE NO.'),' ',p.id,'</p><div class="detail-price">',money(p.price),'</div><p class="detail-description">',escapeHtml(p.description||t('defaultDescription','A treasure whose history has yet to be fully uncovered.')),'</p><div class="spec-list"><div><strong>',t('classification','CLASSIFICATION'),'</strong><span>',escapeHtml(p.category||t('unknownArtifact','Unknown Artifact')),'</span></div><div><strong>',t('origin','ORIGIN'),'</strong><span>',escapeHtml(p.origin||t('unknown','Unknown')),'</span></div><div><strong>',t('rarityLabel','RARITY'),'</strong><span>',escapeHtml(p.rarity||t('unclassified','Unclassified')),'</span></div><div><strong>',t('conditionLabel','CONDITION'),'</strong><span>',escapeHtml(p.condition||t('notRecorded','Not recorded')),'</span></div><div><strong>',t('provenanceLabel','PROVENANCE'),'</strong><span>',escapeHtml(p.provenance||t('unknown','Unknown')),'</span></div><div><strong>',t('availability','AVAILABILITY'),'</strong><span>',Number(p.stock)>0?String(p.stock)+' '+t('inVault','in the vault'):t('unavailable','Currently unavailable'),'</span></div></div><button class="ornate-btn" data-add-to-cart="',p.id,'" ',Number(p.stock)<=0?'disabled':'','>✧ &nbsp; ',t('addToCart','ADD TO CART'),'</button><div class="share-row"><button class="copy-link" data-copy-link>',t('copyLink','COPY DIRECT TREASURE LINK'),'</button></div></div></div><div class="related"><div class="section-heading"><div class="line"></div><div><p>',t('otherDiscoveries','OTHER DISCOVERIES'),'</p><h2>',t('youMayAlsoFind','YOU MAY ALSO FIND'),'</h2></div><div class="line"></div></div><div class="product-grid">',state.products.filter(x=>x.id!==p.id).slice(0,4).map(card).join(''),'</div></div>'].join('');document.title=p.name+' — FLIGALIGA';requestAnimationFrame(jumpToPageTop);}catch(e){$('product-view').innerHTML='<div class="panel-inner"><p class="eyebrow">'+t('archives','THE ARCHIVES')+'</p><h2>'+t('treasureNotFound','Treasure not found')+'</h2><a class="ornate-btn" href="/">'+t('returnToVault','RETURN TO THE VAULT')+'</a></div>';}}

function copyProductLink(){navigator.clipboard?.writeText(location.href);alert(t('linkCopied','Direct treasure link copied.'));}
function setActiveNav(path){document.querySelectorAll('.main-nav a[data-page]').forEach(a=>a.classList.toggle('active',a.getAttribute('href')===path));}
const pageData={
  '/ledger':{kicker:'ledgerKicker',title:'ledgerTitle',intro:'ledgerIntro',blocks:[['ledgerRecentTitle','ledgerRecentText'],['ledgerCatalogueTitle','ledgerCatalogueText'],['ledgerMerchantTitle','ledgerMerchantText']]},
  '/merchant':{kicker:'merchantKicker',title:'merchantTitle',intro:'merchantIntro',blocks:[['merchantPhilosophyTitle','merchantPhilosophyText'],['merchantCollectTitle','merchantCollectText'],['aiTransparencyTitle','aiTransparencyText'],['merchantFinePrintTitle','merchantFinePrintText']]},
  '/faq':{kicker:'faqKicker',title:'faqTitle',intro:'faqIntro',faq:true},
  '/contact':{kicker:'contactKicker',title:'contactTitle',intro:'contactIntro',contact:true},
  '/shipping':{kicker:'shippingKicker',title:'shippingTitle',intro:'shippingIntro',blocks:[['dispatchTitle','dispatchText'],['deliveryEstimatesTitle','deliveryEstimatesText'],['trackingTitle','trackingText'],['internationalOrdersTitle','internationalOrdersText']]},
  '/returns':{kicker:'returnsKicker',title:'returnsTitle',intro:'returnsIntro',blocks:[['withdrawal14Title','withdrawal14Text'],['returnCostsTitle','returnCostsText'],['defectiveTitle','defectiveText'],['beforeLaunchTitle','beforeLaunchText']]},
  '/privacy':{kicker:'privacyKicker',title:'privacyTitle',intro:'privacyIntro',blocks:[['businessIdentityTitle','businessIdentityText'],['personalDataTitle','personalDataText'],['legalBasesTitle','legalBasesText'],['processorsTitle','processorsText'],['dataSharingTitle','dataSharingText'],['retentionRightsTitle','retentionRightsText'],['automatedDecisionTitle','automatedDecisionText'],['cookiesTitle','cookiesText'],['privacyComplaintTitle','privacyComplaintText']]},
  '/terms':{kicker:'termsKicker',title:'termsTitle',intro:'termsIntro',blocks:[['businessDetailsTitle','businessDetailsText'],['productsPricesTitle','productsPricesText'],['orderingPaymentTitle','orderingPaymentText'],['deliveryTitle','deliveryText'],['withdrawalTermsTitle','withdrawalTermsText'],['legalGuaranteeTitle','legalGuaranteeText'],['complaintsTitle','complaintsText'],['productSafetyTitle','productSafetyText'],['aiTransparencyTitle','aiTransparencyText'],['otherTermsTitle','otherTermsText'],['governingLawTitle','governingLawText']]},
  '/withdrawal':{kicker:'withdrawalKicker',title:'withdrawalTitle',intro:'withdrawalIntro',withdrawal:true,blocks:[['withdrawalPeriodTitle','withdrawalPeriodText'],['onlineCancellationTitle','onlineCancellationText'],['returnsBlockTitle','returnsBlockText'],['modelFormTitle','modelFormText']]},
  '/accessibility':{kicker:'accessibilityKicker',title:'accessibilityTitle',intro:'accessibilityIntro',blocks:[['accessibilityCommitmentTitle','accessibilityCommitmentText'],['knownLimitationsTitle','knownLimitationsText'],['feedbackTitle','feedbackText'],['technicalInfoTitle','technicalInfoText']]}
};
async function renderPaymentResult(){
  setActiveNav('');
  show('order-view');
  const title=$('order-view')?.querySelector('h2');
  const result=$('order-result');
  const params=new URLSearchParams(location.search);
  const orderId=Number(params.get('order'));
  const cancelled=params.get('cancelled')==='1';

  if(!Number.isInteger(orderId)||orderId<=0){
    if(title)title.textContent=t('orderStatusTitle','ORDER STATUS');
    if(result)result.textContent=t('paymentResultMissing','We could not identify this order.');
    return;
  }

  if(title)title.textContent=t('orderStatusTitle','ORDER STATUS');
  if(result)result.textContent=cancelled?t('paymentResultCancelled','The payment was canceled. We are checking the final order status...'):t('paymentResultChecking','We are checking your payment status...');

  let attempts=0;
  async function checkStatus(){
    attempts++;
    try{
      const r=await fetch('/api/orders/'+orderId,{cache:'no-store'});
      if(!r.ok){
        if(result)result.textContent=t('paymentResultUnavailable','We could not load the order status. Please try again from your account.');
        return;
      }

      const order=await r.json();
      if(result){
        let message=t('paymentResultUnknown','Your order exists, but its payment status needs attention.');
        if(order.status==='paid')message=t('paymentResultPaid','Payment received. Your order is confirmed.');
        else if(order.status==='payment_pending')message=t('paymentResultPending','Payment is still being confirmed. This page will check again automatically.');
        else if(['payment_failed','failed'].includes(order.status))message=t('paymentResultFailed','The payment failed. Your reserved stock has been released.');
        else if(['payment_expired','expired'].includes(order.status))message=t('paymentResultExpired','The payment expired. Your reserved stock has been released.');
        else if(['payment_canceled','canceled'].includes(order.status))message=t('paymentResultCanceled','The payment was canceled. Your reserved stock has been released.');
        result.textContent=t('orderNumber','Order #')+order.id+' — '+message;
      }

      if(order.status==='paid'){
        try{
          const purchaseKey='fligaliga-purchase-sent-'+order.id;
          const alreadySent=localStorage.getItem(purchaseKey)==='1';
          if(!alreadySent){
            const itemsResponse=await fetch('/api/orders/'+order.id+'/items',{cache:'no-store'});
            const items=itemsResponse.ok?await itemsResponse.json():[];
            if(items.length){
              const total=items.reduce((sum,item)=>sum+(Number(item.price)||0)*(Number(item.quantity)||0),0);
              trackEcommerceEvent('purchase',{transaction_id:String(order.id),currency:STORE_CURRENCY,value:Number(total.toFixed(2)),items:items.map((item,index)=>ecommerceItem(item,item.quantity,index))});
              try{localStorage.setItem(purchaseKey,'1');}catch{}
            }
          }
        }catch(err){console.error('Purchase analytics failed:',err);}
      }
      if(order.status==='payment_pending' && attempts<6){
        window.setTimeout(checkStatus,2000);
      }
    }catch{
      if(result)result.textContent=t('paymentResultUnavailable','We could not load the order status. Please try again from your account.');
    }
  }
  checkStatus();
}

function renderPage(path){if(path==='/treasures'||path==='/new-arrivals')return renderCataloguePage(path);const d=pageData[path];if(!d)return renderHome();setActiveNav(path);show('content-view');let html='<div class="page-hero"><p class="eyebrow">'+t(d.kicker,d.kicker)+'</p><h1>'+t(d.title,d.title)+'</h1><p>'+t(d.intro,d.intro)+'</p></div>';if(d.faq)html+=faqHtml();else if(d.contact)html+=contactHtml();else { html+='<div class="info-grid">'+d.blocks.map(([h,b])=>'<article><h3>'+t(h,h)+'</h3><p>'+t(b,b)+'</p></article>').join('')+'</div>'; if(d.withdrawal) html+=withdrawalHtml(); }$('content-view').innerHTML=html;document.title=t(d.title,d.title)+' — FLIGALIGA';}
function withdrawalHtml(){
  return '<div class="contact-layout withdrawal-action"><div class="contact-card"><p class="eyebrow">'+t('cancellationActionKicker','YOUR RIGHT TO WITHDRAW')+'</p><h3>'+t('cancellationActionTitle','CANCEL AN ONLINE PURCHASE')+'</h3><p>'+t('cancellationActionText','Use this form to clearly notify FLIGALIGA that you want to withdraw from an online purchase. We will record your request and contact you about the return and refund process.')+'</p><form id="withdrawal-form" class="contact-form"><label><span>'+t('orderNumberLabel','ORDER NUMBER')+'</span><input id="withdrawal-order" type="number" min="1" inputmode="numeric" required></label><label><span>'+t('emailLabel','EMAIL ADDRESS')+'</span><input id="withdrawal-email" type="email" maxlength="254" autocomplete="email" required></label><label><span>'+t('reasonLabel','REASON (OPTIONAL)')+'</span><textarea id="withdrawal-reason" maxlength="2000"></textarea></label><label class="checkout-consent"><input id="withdrawal-confirm" type="checkbox" required><span>'+t('withdrawalConfirm','I confirm that I want to withdraw from this purchase.')+'</span></label><button class="ornate-btn" type="submit">'+t('withdrawalButton','HERE TO CANCEL THE AGREEMENT')+'</button><p id="withdrawal-message" class="muted-note" aria-live="polite"></p></form></div></div>';
}

function faqHtml(){const items=[['faqFindQuestion','faqFindAnswer'],['faqShareQuestion','faqShareAnswer'],['faqDeliveryQuestion','faqDeliveryAnswer'],['faqReturnQuestion','faqReturnAnswer'],['faqContactQuestion','faqContactAnswer'],['faqAuthenticQuestion','faqAuthenticAnswer']];return '<div class="faq-list">'+items.map(([q,a])=>'<details><summary>'+t(q,q)+'</summary><p>'+t(a,a)+'</p></details>').join('')+'</div>';}
function contactHtml(){return '<div class="contact-layout"><div class="contact-card"><p class="eyebrow">'+t('reachVault','REACH THE VAULT')+'</p><h3>'+t('contactDetails','CONTACT DETAILS')+'</h3><p class="placeholder-copy">'+t('contactPlaceholder','Business email: fligaliga@hotmail.com. Other business details will be added before launch.')+'</p><ul><li><strong>'+t('email','EMAIL')+'</strong><a class="contact-email" href="mailto:fligaliga@hotmail.com">fligaliga@hotmail.com</a></li><li><strong>'+t('telephone','TELEPHONE')+'</strong><span>[PLACEHOLDER — '+t('businessPhone','business phone')+']</span></li><li><strong>'+t('address','ADDRESS')+'</strong><span>[PLACEHOLDER — '+t('businessAddress','registered business address')+']</span></li><li><strong>'+t('kvk','KVK')+'</strong><span>[PLACEHOLDER — '+t('kvkNumber','KvK number')+']</span></li><li><strong>'+t('vat','VAT')+'</strong><span>[PLACEHOLDER — '+t('vatId','VAT ID, if applicable')+']</span></li><li><strong>'+t('reachability','REACHABILITY')+'</strong><span>[PLACEHOLDER — '+t('supportHours','support hours')+']</span></li></ul></div><div class="contact-card"><p class="eyebrow">'+t('sendMessage','SEND A MESSAGE')+'</p><h3>'+t('contactForm','CONTACT FORM')+'</h3><p class="muted-note">'+t('contactFormPlaceholder','Send a question to the merchant. We will reply to the email address you provide.')+'</p><form id="contact-form" class="contact-form"><label><span>'+t('contactName','NAME')+'</span><input id="contact-name" type="text" maxlength="120" autocomplete="name" required></label><label><span>'+t('contactEmail','EMAIL ADDRESS')+'</span><input id="contact-email" type="email" maxlength="254" autocomplete="email" required></label><label><span>'+t('contactMessage','MESSAGE')+'</span><textarea id="contact-message" maxlength="5000" required></textarea></label><button class="ornate-btn" type="submit">'+t('contactSend','SEND MESSAGE')+'</button><p id="contact-form-message" class="muted-note" aria-live="polite"></p></form></div></div>';}

function renderCataloguePage(path){show('content-view');setActiveNav(path);const isNew=path==='/new-arrivals';state.newOnly=isNew;state.category='all';state.search=new URLSearchParams(location.search).get('q')||'';$('content-view').innerHTML=`<div class="catalogue-page"><div class="page-hero compact"><p class="eyebrow">${isNew?t('recentlyCatalogued','RECENTLY CATALOGUED'):t('completeCollection','THE COMPLETE COLLECTION')}</p><h1>${isNew?t('newArrivalsTitle','NEW ARRIVALS'):t('treasuresTitle','TREASURES')}</h1><p>${isNew?t('latestDiscoveries','The latest discoveries to enter the Vault.'):t('browseCatalogue','Browse the full catalogue of artifacts, curiosities, oddities and mysteries.')}</p></div><div class="catalogue-tools"><button class="ghost-btn" data-navigate="/">← ${t('vault','THE VAULT')}</button><span id="catalogue-count"></span></div><div id="catalogue-products" class="product-grid"></div></div>`;const list=state.products.filter(p=>{const q=state.search.toLowerCase();const matches=!q||`${p.name} ${p.description} ${p.category} ${p.origin} ${p.rarity}`.toLowerCase().includes(q);return matches&&(!isNew||p.is_new_arrival);});$('catalogue-products').innerHTML=list.length?list.map(card).join(''):`<div class="empty-state">${t('noTreasures','No treasures are currently catalogued.')}</div>`;$('catalogue-count').textContent=`${list.length} ${list.length===1?t('discoverySingular','discovery'):t('discoveryPlural','discoveries')} ${t('inView','in view')}`;document.title=`${isNew?t('newArrivalsTitle','New Arrivals'):t('treasuresTitle','Treasures')} — FLIGALIGA`;}
function renderHome(){state.newOnly=false;state.category='all';state.search=new URLSearchParams(location.search).get('q')||'';if($('search-input'))$('search-input').value=state.search;setActiveNav('/');show('home-view');document.title='FLIGALIGA — '+t('vault','The Vault');renderProducts(true);}
function saveCatalogueHistory(){if(!['/','/new-arrivals'].includes(location.pathname))return;history.replaceState({...history.state,fligaligaView:{category:state.category,search:state.search,newOnly:state.newOnly,catalogueExpanded:state.catalogueExpanded,scrollY:window.scrollY}},'',location.href);}
function resetHeaderForNavigation(){clearTimeout(headerShowTimer);headerShowTimer=null;scrollDirection=0;directionDistance=0;lastScrollY=0;document.querySelector('.site-header')?.classList.remove('header-hidden');}
function jumpToPageTop(){resetHeaderForNavigation();const root=document.documentElement;const previous=root.style.scrollBehavior;root.style.scrollBehavior='auto';window.scrollTo(0,0);root.scrollTop=0;document.body.scrollTop=0;requestAnimationFrame(()=>{root.style.scrollBehavior=previous;});}
function navigate(path){if(path.startsWith('/product/')){saveCatalogueHistory();document.activeElement?.blur();jumpToPageTop();}history.pushState({},'',path);route();window.setTimeout(trackAnalyticsPageView,0);}
function route(historyState=null){const snapshot=historyState?.fligaligaView;if(snapshot){state.category=snapshot.category||'all';state.search=snapshot.search||'';state.newOnly=!!snapshot.newOnly;state.catalogueExpanded=!!snapshot.catalogueExpanded;pendingCatalogueScroll=Number.isFinite(Number(snapshot.scrollY))?Number(snapshot.scrollY):0;}const path=location.pathname;if(path.startsWith('/product/'))return renderProductFromPath();if(path==='/')return renderHome(!!snapshot);if(path==='/treasures'){navigate('/');return;}if(path==='/payment-result')return renderPaymentResult();if(pagePaths.has(path))return renderPage(path);return renderPage('/faq');}
async function me(){const r=await fetch('/api/me');state.user=r.ok?await r.json():null;state.isAdmin=!!state.user?.isAdmin;$('login-link').classList.toggle('hidden',!!state.user);$('logout-btn').classList.toggle('hidden',!state.user);$('admin-link').classList.toggle('hidden',!state.isAdmin);}
async function loadCart(){const r=await fetch('/api/cart');if(!r.ok){$('cart-count').textContent='0';$('cart-list').innerHTML='<p class="muted-note">'+t('loginToViewLedger','Enter the Vault to view your ledger.')+'</p>';$('cart-total').textContent=money(0);return}const items=await r.json();$('cart-count').textContent=items.reduce((n,i)=>n+Number(i.quantity),0);$('cart-list').innerHTML=items.length?items.map(i=>`<div class="cart-row"><div><strong>${escapeHtml(i.name)}</strong><br><span>${money(i.price)} ${t('each','each')}</span></div><div class="qty"><button data-cart-id="${i.id}" data-cart-qty="${i.quantity-1}">−</button><span>${i.quantity}</span><button data-cart-id="${i.id}" data-cart-qty="${i.quantity+1}">+</button></div><strong>${money(Number(i.price)*i.quantity)}</strong></div>`).join('') :'<p>'+t('ledgerEmpty','Your ledger is empty.')+'</p>';$('cart-total').textContent=money(cartEcommerceValue(items));}
async function addToCart(id){if(!state.user){show('auth-view');return}const product=state.products.find(item=>Number(item.id)===Number(id));const r=await fetch('/api/cart',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product_id:id})});if(r.ok){if(product)trackEcommerceEvent('add_to_cart',{currency:STORE_CURRENCY,value:Number(product.price)||0,items:[ecommerceItem(product,1)]});await loadCart();alert(t('addedToLedger','Treasure added to your ledger.'))}else alert(await r.text());}
async function updateCart(id,q){const r=await fetch('/api/cart/update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,quantity:q})});if(!r.ok)alert(await r.text());await loadCart();}
async function login(e){e.preventDefault();const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:$('login-user').value.trim(),password:$('login-pass').value})});if(!r.ok){const d=await r.json().catch(()=>({}));return alert(d.error||'Login failed.');}await me();await loadCart();navigate('/');}
async function register(e){e.preventDefault();const r=await fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:$('reg-user').value.trim(),password:$('reg-pass').value})});if(!r.ok){const d=await r.json().catch(()=>({}));return alert(d.error||'Registration failed.');}alert(t('accountCreated','Account created. You may now enter the vault.'));$('reg-user').value='';$('reg-pass').value='';}
async function logout(){await fetch('/api/logout',{method:'POST'});await me();await loadCart();navigate('/');}
async function openCheckout(){if(!state.user){show('auth-view');return}const items=await fetch('/api/cart').then(r=>r.ok?r.json():[]).catch(()=>[]);if(!items.length){$('checkout-message').textContent=t('ledgerEmpty','Your ledger is empty.');return}trackEcommerceEvent('begin_checkout',{currency:STORE_CURRENCY,value:cartEcommerceValue(items),items:cartEcommerceItems(items)});$('checkout-panel').classList.remove('hidden');$('checkout-name').focus();}
async function checkout(e){e.preventDefault();$('checkout-message').textContent='';const body={customer_name:$('checkout-name').value.trim(),customer_email:$('checkout-email').value.trim(),shipping_address_line1:$('checkout-address').value.trim(),shipping_postcode:$('checkout-postcode').value.trim(),shipping_city:$('checkout-city').value.trim(),shipping_country:$('checkout-country').value.trim().toUpperCase(),accept_terms:$('checkout-terms').checked};const r=await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok){$('checkout-message').textContent=d.error||t('checkoutFailed','Checkout failed.');return}if(d.checkoutUrl){window.location.href=d.checkoutUrl;return}$('checkout-message').textContent=t('paymentNotStarted','Payment could not be started.');}
async function emptyCart(){if(!confirm(t('emptyCartConfirm','Empty your cart?')))return;await fetch('/api/cart/empty',{method:'POST'});await loadCart();}
async function loadOrders(){if(!state.isAdmin)return;const r=await fetch('/api/admin/orders');if(!r.ok)return;$('admin-orders').innerHTML=(await r.json()).map(o=>`<div class="admin-order"><strong>Order #${o.id}</strong> — ${escapeHtml(o.username)} — ${money(o.total)}<br>${o.items.map(i=>`${escapeHtml(i.name)} × ${i.quantity}`).join(', ')}</div>`).join('')||'<p>'+t('noOrders','No orders yet.')+'</p>';}
async function loadAdminProducts(){if(!state.isAdmin)return;const r=await fetch('/api/admin/products');if(!r.ok)return;state.adminProducts=await r.json();$('admin-products').innerHTML=state.adminProducts.length?state.adminProducts.map(p=>`<div class="admin-product-row"><div><strong>${escapeHtml(p.name)}</strong><span>${money(p.price)}</span><small>${escapeHtml(p.category||'—')} · ${Number(p.stock)||0} ${t('inStock','in stock')}${p.is_featured?' · '+t('featuredShort','FEATURED'):''}${p.is_new_arrival?' · '+t('newShort','NEW'):''}</small></div><button type="button" class="admin-edit" data-admin-edit="${p.id}" data-i18n="editProduct">EDIT</button></div>`).join(''):`<p class="muted-note">${t('noTreasures','No treasures are currently catalogued.')}</p>`;}
function resetAdminForm(){state.adminEditingId=null;$('admin-product-form').reset();$('admin-form-title').textContent=t('addTreasure','ADD TREASURE');$('admin-save-btn').textContent=t('catalogueTreasure','CATALOGUE TREASURE');$('admin-cancel-edit').classList.add('hidden');}
function startAdminEdit(id){const p=state.adminProducts.find(item=>Number(item.id)===Number(id));if(!p)return;state.adminEditingId=Number(id);$('prod-name').value=p.name||'';$('prod-description').value=p.description||'';$('prod-price').value=p.price??'';$('prod-stock').value=p.stock??'';$('prod-image').value=p.image_url||'';$('prod-category').value=p.category||'';$('prod-rarity').value=p.rarity||'';$('prod-origin').value=p.origin||'';$('prod-condition').value=p.condition||'';$('prod-provenance').value=p.provenance||'';$('prod-featured').checked=!!p.is_featured;$('prod-new').checked=!!p.is_new_arrival;$('admin-form-title').textContent=t('editTreasure','EDIT TREASURE');$('admin-save-btn').textContent=t('saveChanges','SAVE CHANGES');$('admin-cancel-edit').classList.remove('hidden');$('prod-name').focus();window.scrollTo({top:$('admin-product-form').getBoundingClientRect().top+window.scrollY-25,left:0,behavior:'smooth'});}
async function adminAdd(e){e.preventDefault();const body={name:$('prod-name').value.trim(),description:$('prod-description').value.trim(),price:Number($('prod-price').value),stock:Number($('prod-stock').value),image_url:$('prod-image').value.trim()||null,category:$('prod-category').value.trim()||'Artifacts',rarity:$('prod-rarity').value.trim()||null,origin:$('prod-origin').value.trim()||null,condition:$('prod-condition').value.trim()||null,provenance:$('prod-provenance').value.trim()||null,is_featured:$('prod-featured').checked,is_new_arrival:$('prod-new').checked};const editingId=state.adminEditingId;const r=await fetch(editingId?'/api/admin/product/'+editingId:'/api/admin/product',{method:editingId?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)return alert(d.error||t('saveFailed','Could not save treasure.'));resetAdminForm();await loadProducts();await loadAdminProducts();await loadOrders();alert(editingId?t('treasureUpdated','Treasure updated.'):t('treasureCatalogued','Treasure catalogued.'));}
function applySearchFromUrl(){const q=new URLSearchParams(location.search);state.search=q.get('q')||'';if($('search-input'))$('search-input').value=state.search;}
document.addEventListener('change',async e=>{const sel=e.target.closest('[data-withdrawal-id]');if(!sel)return;const id=Number(sel.dataset.withdrawalId);const r=await fetch('/api/admin/withdrawals/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:sel.value})});if(!r.ok){alert(t('withdrawalUpdateFailed','Could not update withdrawal request.'));await loadAdminWithdrawals();}});
document.addEventListener('click',e=>{const adminEdit=e.target.closest('[data-admin-edit]');if(adminEdit){startAdminEdit(Number(adminEdit.dataset.adminEdit));return;}const nav=e.target.closest('[data-navigate]');if(nav){navigate(nav.dataset.navigate);return;}const homeScroll=e.target.closest('[data-home-scroll]');if(homeScroll){if(location.pathname==='/'){history.replaceState({},'', '/#'+homeScroll.dataset.homeScroll);document.getElementById(homeScroll.dataset.homeScroll)?.scrollIntoView({behavior:'smooth'});}else{navigate('/#'+homeScroll.dataset.homeScroll);}return;}const add=e.target.closest('[data-add-to-cart]');if(add){addToCart(Number(add.dataset.addToCart));return;}const qty=e.target.closest('[data-cart-id]');if(qty){updateCart(Number(qty.dataset.cartId),Number(qty.dataset.cartQty));return;}const copy=e.target.closest('[data-copy-link]');if(copy){copyProductLink();return;}const cardEl=e.target.closest('.product-card');if(cardEl){navigate(cardEl.dataset.productUrl);}});document.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const cardEl=e.target.closest('.product-card');if(cardEl){navigate(cardEl.dataset.productUrl);}}});document.addEventListener('submit',async e=>{
  if(e.target.matches('#withdrawal-form')){
    e.preventDefault();
    if(!window.confirm(t('withdrawalConfirmDialog','Confirm that you want to withdraw from this purchase.')))return;
    const message=$('withdrawal-message');
    const body={
      order_id:Number($('withdrawal-order').value),
      email:$('withdrawal-email').value.trim(),
      reason:$('withdrawal-reason').value.trim()
    };
    try{
      const r=await fetch('/api/withdrawal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const d=await r.json().catch(()=>({}));
      if(!r.ok){if(message)message.textContent=d.error||t('withdrawalFailed','Could not submit the withdrawal request.');return;}
      if(message)message.textContent=d.confirmationEmailSent?t('withdrawalSubmittedEmail','Your withdrawal request has been recorded. Request #')+d.requestId+'. A confirmation email has been sent.':t('withdrawalSubmitted','Your withdrawal request has been recorded. Request #')+d.requestId+'.';
      e.target.reset();
    }catch{
      if(message)message.textContent=t('withdrawalFailed','Could not submit the withdrawal request.');
    }
    return;
  }
  if(e.target.matches('#contact-form')){
    e.preventDefault();
    const message=$('contact-form-message');
    const body={
      name:$('contact-name').value.trim(),
      email:$('contact-email').value.trim(),
      message:$('contact-message').value.trim()
    };
    if(message)message.textContent=t('contactSending','SENDING MESSAGE…');
    try{
      const r=await fetch('/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const d=await r.json().catch(()=>({}));
      if(!r.ok){if(message)message.textContent=d.error||t('contactFailed','Could not send your message.');return;}
      if(message)message.textContent=t('contactSent','Your message has been sent. We will reply by email.');
      e.target.reset();
    }catch{
      if(message)message.textContent=t('contactFailed','Could not send your message. Please email fligaliga@hotmail.com directly.');
    }
    return;
  }
});document.addEventListener('error',e=>{
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
},true);history.scrollRestoration='manual';window.addEventListener('popstate',e=>{route(e.state);window.setTimeout(trackAnalyticsPageView,0);});
function detectedBrowserLanguage(){
  const browserLanguage = String((navigator.languages && navigator.languages.length ? navigator.languages[0] : navigator.language) || 'en').toLowerCase();
  return browserLanguage.startsWith('nl') ? 'nl' : 'en';
}
function currentLanguage(){
  return localStorage.getItem('fligaliga-language') || detectedBrowserLanguage();
}
function applyLanguage(){
  const lang = currentLanguage();
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
  const theme = localStorage.getItem('fligaliga-theme') || 'light';
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
    searchPlaceholder:'Search treasures...',cookieNoticeTitle:'COOKIE NOTICE',cookieNoticeText:'FLIGALIGA uses necessary storage for login, checkout and site preferences. Optional Google Analytics helps us understand visits and improve the shop; it is only activated after you explicitly allow analytics.',cookieNoticePrivacy:'Read the privacy notice',cookieSettingsFab:'COOKIE SETTINGS',cookieSettingsKicker:'PRIVACY SETTINGS',cookieSettingsTitle:'COOKIE SETTINGS',cookieSettingsIntro:'Necessary storage supports core webshop functions and cannot be switched off. Optional analytics is off unless you allow it.',cookieNecessaryTitle:'NECESSARY',cookieNecessaryText:'Session and preference storage needed for login, checkout and language/theme settings.',cookieAnalyticsTitle:'ANALYTICS',cookieAnalyticsText:'Optional Google Analytics measurement to understand visits and improve the shop.',cookieAlwaysOn:'ALWAYS ON',cookieSave:'SAVE PREFERENCES',cookieSettingsPrivacy:'PRIVACY NOTICE',cookieNoticeAccept:'ALLOW ANALYTICS',cookieNoticeReject:'REJECT ANALYTICS',cookieNoticeSettings:'SETTINGS',admin:'ADMIN',enter:'ENTER',leave:'LEAVE',welcomeTo:'WELCOME TO',vault:'THE VAULT',
    heroSub:'Treasures collected from places<br>better left forgotten.',enterVault:'ENTER THE VAULT',allTreasures:'ALL TREASURES',
    artifacts:'ARTIFACTS',collectibles:'COLLECTIBLES',oddities:'ODDITIES',mysteryBoxes:'MYSTERY BOXES',
    recentlyDiscovered:'RECENTLY DISCOVERED',featuredTreasures:'FEATURED TREASURES',clearFilter:'CLEAR FILTER ×',
    fastShipping:'FAST & SECURE SHIPPING',shippingSub:'Your treasures, safely delivered.',secureReturns:'SECURE RETURNS',
    returnsSub:'A clear path when plans change.',uniqueAuthentic:'UNIQUE & AUTHENTIC',uniqueSub:'Each item has a story.',
    contactMerchant:'CONTACT THE MERCHANT',contactSub:"Have a question? We're here.",merchantOffice:"THE MERCHANT'S OFFICE",
    enterTheVault:'ENTER THE VAULT',returningTraveler:'RETURNING TRAVELER',newArrival:'NEW ARRIVAL',
    username:'Username',password:'Password',chooseUsername:'Choose a username',choosePassword:'Choose a password',
    yourLedger:'YOUR LEDGER',deliveryDetails:'DELIVERY DETAILS',completeOrder:'COMPLETE YOUR ORDER',placeOrder:'PLACE ORDER & PAY',
    cancel:'CANCEL',merchant:'THE MERCHANT',adminLedger:'ADMIN LEDGER',addTreasure:'ADD TREASURE',orders:'ORDERS',
    cart:'THE CART',emptyCart:'EMPTY CART',checkout:'CHECKOUT',footerTagline:'Some treasures are not meant to be found...',classification:'Classification',origin:'Origin',viewArtifact:'VIEW ARTIFACT',recentlyCatalogued:'RECENTLY CATALOGUED',completeCollection:'THE COMPLETE COLLECTION',newArrivalsTitle:'NEW ARRIVALS',treasuresTitle:'TREASURES',latestDiscoveries:'The latest discoveries to enter the Vault.',browseCatalogue:'Browse the full catalogue of artifacts, curiosities, oddities and mysteries.',noTreasures:'No treasures are currently catalogued.',discoverySingular:'discovery',discoveryPlural:'discoveries',inView:'in view',ledgerKicker:'THE ARCHIVE',ledgerTitle:'THE LEDGER',ledgerIntro:'A record of expeditions, discoveries and treasures that have passed through the Vault.',ledgerRecentTitle:'Recent discoveries',ledgerRecentText:'Every catalogue entry begins as a story: where it was found, what is known about it, and what remains a mystery.',ledgerCatalogueTitle:'The catalogue',ledgerCatalogueText:'Browse the current collection through the Vault, New Arrivals and individual artifact pages.',ledgerMerchantTitle:'A note from the merchant',ledgerMerchantText:'The Ledger is intentionally incomplete. Some provenance is lost, some details are disputed, and some treasures are simply better left unexplained.',merchantKicker:'THE ONE WHO KEEPS THE VAULT',merchantTitle:'ABOUT THE MERCHANT',merchantIntro:'Welcome, traveller. The Vault is a fictionalized antique-curiosity shop concept built around the idea that every object deserves a story.',merchantPhilosophyTitle:'The philosophy',merchantPhilosophyText:'FLIGALIGA treats the shop as part catalogue, part expedition journal. The visual language is deliberately old-world: brass, parchment, candlelight and deep shadow.',merchantCollectTitle:'What we collect',merchantCollectText:'Artifacts, curiosities, nautical relics, oddities and objects with an unusual history — real, imagined, or still waiting to be uncovered.',merchantFinePrintTitle:'The fine print',merchantFinePrintText:'Replace this story with your real business story, company details and contact information before launch.',faqKicker:'QUESTIONS FROM THE ROAD',faqTitle:'FREQUENTLY ASKED QUESTIONS',faqIntro:'A starting FAQ for the Vault. Product-specific answers should always override these general notes.',faqFindQuestion:'How do I find a specific treasure?',faqFindAnswer:'Use the search field, browse the Vault or New Arrivals pages, or open a product’s direct archive link.',faqShareQuestion:'Can I share a product directly?',faqShareAnswer:'Yes. Every treasure has its own URL, so you can copy the address from the product page and send it directly.',faqDeliveryQuestion:'How long does delivery take?',faqDeliveryAnswer:'Delivery times are currently placeholder content. Add your real carrier, dispatch time and delivery estimate before launch.',faqReturnQuestion:'Can I return an online purchase?',faqReturnAnswer:'For many EU online purchases, consumers have a 14-day withdrawal period, subject to exceptions. See the Returns page for the draft policy.',faqContactQuestion:'How do I contact the merchant?',faqContactAnswer:'Use the Contact page. Add your real email address and telephone details before the shop goes live.',faqAuthenticQuestion:'Are the treasures authentic?',faqAuthenticAnswer:'Use this answer for your real sourcing and authenticity policy. Each product page should clearly describe what is known about the item.',contactKicker:'THE MERCHANT’S OFFICE',contactTitle:'CONTACT THE MERCHANT',contactIntro:'Questions about a treasure, an order or the expedition? This page is ready for your real contact details.',shippingKicker:'THE EXPEDITION',shippingTitle:'SHIPPING & DELIVERY',shippingIntro:'This page explains the delivery rules for FLIGALIGA orders. Before purchase, customers must be shown the delivery area, delivery method, delivery charge and expected delivery period. The exact launch countries, carrier and prices are still [TO COMPLETE BEFORE LAUNCH].',dispatchTitle:'Dispatch',dispatchText:'Orders are prepared after payment and dispatched using the delivery method shown at checkout. The customer sees the applicable delivery charge and expected delivery period before placing the order.',deliveryEstimatesTitle:'Delivery estimates',deliveryEstimatesText:'Unless a different delivery period is expressly agreed, goods should normally be delivered within 30 days. If FLIGALIGA fails to deliver within the agreed period, the customer may exercise the rights available under applicable consumer law, including cancellation where the legal conditions are met.',trackingTitle:'Tracking',trackingText:'When tracking is available, the dispatch or order confirmation will provide the tracking reference or link. FLIGALIGA normally remains responsible for loss or damage until the customer receives the goods, except where the customer independently chooses a carrier that FLIGALIGA did not offer.',internationalOrdersTitle:'International orders',internationalOrdersText:'Launch shipping area: [TO COMPLETE BEFORE LAUNCH]. If FLIGALIGA later sells outside the Netherlands, the website will clearly state the countries served, delivery charges, expected delivery periods and any applicable duties, taxes or restrictions.',returnsKicker:'THE RETURN VOYAGE',returnsTitle:'RETURNS & WITHDRAWAL',returnsIntro:'This page explains the statutory withdrawal and return rules for online consumer purchases. Business-specific return instructions, including the return address and return-cost policy, must be completed before launch.',withdrawal14Title:'14-day withdrawal',withdrawal14Text:'Consumers normally have 14 calendar days to withdraw from an online purchase without giving a reason. For goods, the period normally starts on the day after receipt. If an order contains several goods delivered separately, the period normally starts when the last good is received. Certain statutory exceptions apply and must be communicated before purchase when relevant.',returnCostsTitle:'Return costs',returnCostsText:'The customer normally pays the direct cost of returning goods unless FLIGALIGA agrees to bear it or failed to provide the required information. After a valid withdrawal, FLIGALIGA normally refunds the purchase price and the cost of standard delivery within 14 days, subject to the statutory right to wait for the goods or proof of return.',defectiveTitle:'Defective or incorrect items',defectiveText:'The withdrawal right is separate from statutory conformity rights. If a product is defective, damaged, incomplete, different from its description, or does not have the durability the customer could reasonably expect, the customer can rely on statutory remedies. FLIGALIGA will apply the remedy required by the circumstances and applicable law.',beforeLaunchTitle:'Before launch',beforeLaunchText:'Before launch, complete the return address, return-cost policy, shipping area and any product-specific withdrawal exceptions. The online cancellation function and the statutory model withdrawal form are both available; one does not replace the other.',privacyKicker:'THE PRIVATE LEDGER',privacyTitle:'PRIVACY',privacyIntro:'This privacy notice explains what personal data FLIGALIGA processes, why it is needed, the legal basis, who receives it, how long it is kept, and how visitors and customers can exercise their rights. The registered business identity and final production details must be completed before launch.',businessIdentityTitle:'Business identity',businessIdentityText:'FLIGALIGA is the trading name used by this webshop. Before launch, this page must identify the legal trader, business address, KVK number, VAT identification number, telephone or other required contact route, and the privacy contact email. Current customer contact: fligaliga@hotmail.com.',personalDataTitle:'Personal data',personalDataText:'Depending on use of the webshop, FLIGALIGA may process an account username and password hash; order and product information; name; delivery address; postcode; city; country; email address; Mollie payment identifiers and status; withdrawal or cancellation details; customer messages; session information; and consent preferences. Only data needed for the relevant purpose is collected.',legalBasesTitle:'Legal bases',legalBasesText:'Account, order, delivery, payment and return/cancellation processing is generally necessary to perform a contract or take steps at the customer\'s request before a contract. Some records must be kept because the law requires it. Security and fraud prevention may rely on legitimate interests where permitted. Optional Google Analytics is used only after explicit consent.',processorsTitle:'Processors',processorsText:'Service providers may receive personal data only as needed for their role. Current categories include hosting/infrastructure, PostgreSQL database infrastructure, Mollie for payments, delivery providers, Resend for transactional email when enabled and Google Analytics for optional measurement after consent. Google Fonts is used for typography and may cause the browser to connect to Google\'s font services. Exact production providers and required processor agreements must be recorded before launch.',dataSharingTitle:'Recipients and international transfers',dataSharingText:'FLIGALIGA does not sell customer personal data. Data may be shared with service providers needed to operate the webshop and fulfil orders. Google Analytics receives measurement data only after consent. Google\'s current measurement terms identify Google Ireland Limited as Google\'s European end controller for European controller personal data; where data is transferred outside the EEA, Google describes lawful transfer mechanisms such as adequacy arrangements or standard contractual clauses.',automatedDecisionTitle:'Automated decision-making',automatedDecisionText:'FLIGALIGA does not currently use personal data to make decisions about customers based solely on automated processing that produce legal or similarly significant effects.',privacyComplaintTitle:'Privacy complaints',privacyComplaintText:'Privacy questions or rights requests can be sent to fligaliga@hotmail.com. You also have the right to complain to the Dutch Data Protection Authority (Autoriteit Persoonsgegevens) if you believe your personal data is processed unlawfully.',retentionRightsTitle:'Retention & rights',retentionRightsText:'FLIGALIGA keeps personal data no longer than necessary unless a longer legal period applies. Tax and accounting records may need to be retained for at least 7 years. Account data may be deleted when no longer needed, subject to legal duties and unresolved transactions. Where applicable, visitors and customers can request access, correction, deletion, restriction or portability and can object. Consent can be withdrawn at any time for processing based on consent. Requests go to fligaliga@hotmail.com; FLIGALIGA normally responds within 1 month and may verify identity.',cookiesTitle:'Cookies',cookiesText:'The webshop uses an essential session cookie for login and checkout-related functionality and browser local storage for language/theme preferences. Optional Google Analytics is loaded only after explicit consent. Advertising functionality is not used. GA4 data-retention settings must be confirmed and recorded in the final privacy notice before launch.',termsKicker:'THE MERCHANT’S TERMS',termsTitle:'GENERAL TERMS & CONDITIONS',termsIntro:'These terms apply to consumer purchases made through the FLIGALIGA webshop. They should be read together with the product information, shipping information, privacy notice and withdrawal information shown on the site. The legally registered trader details and final commercial policies must be completed before launch.',businessDetailsTitle:'Business details',businessDetailsText:'Before accepting real consumer orders, this page must identify the legal trader: registered name, trade name if different, address details as legally required, email address, telephone number or other permitted contact route, KVK number and VAT identification number. Current customer contact email: fligaliga@hotmail.com. The complaint procedure and any complaints-board affiliation must also be stated.',productsPricesTitle:'Products & prices',productsPricesText:'Each offer must state the main characteristics necessary for an informed purchase, such as material, dimensions, condition and other important features. Consumer prices must show the total price including applicable taxes and unavoidable additional costs. Important product-specific limitations or exceptions must be clear before ordering.',orderingPaymentTitle:'Ordering & payment',orderingPaymentText:'Customers can review their basket, enter the required contact and delivery details, accept the applicable terms and withdrawal information, and choose an available payment method. The final order button makes the payment obligation clear. Payments are processed through Mollie. After ordering, FLIGALIGA provides the legally required order information in a durable form such as email.',deliveryTitle:'Delivery',deliveryText:'Before purchase, FLIGALIGA states where it delivers, the available delivery method, the delivery charge and the expected delivery period. Unless a different period is agreed, delivery should normally occur within 30 days. Risk of loss or damage normally remains with FLIGALIGA until the consumer receives the goods.',legalGuaranteeTitle:'Legal guarantee & complaints',legalGuaranteeText:'Consumers have statutory rights when goods do not conform to the agreement. The Netherlands does not use one fixed statutory guarantee period; what a customer may reasonably expect depends on the product and circumstances. Any commercial warranty is additional and cannot remove or reduce statutory consumer rights.',otherTermsTitle:'Other terms',otherTermsText:'These terms do not exclude mandatory consumer protections. A product-specific exception to the withdrawal right is only used when a legal exception actually applies and the customer is informed before purchase. Business-specific shipping, returns and company details will be completed before launch.',governingLawTitle:'Applicable law',governingLawText:'Unless mandatory consumer law provides otherwise, Dutch law governs purchases made through FLIGALIGA. Nothing in these terms removes mandatory consumer protections that apply in the consumer\'s country of residence.',withdrawalTermsTitle:'Withdrawal and cancellation',withdrawalTermsText:'Consumers normally have 14 calendar days to withdraw from an online goods purchase without giving a reason. FLIGALIGA provides the required online cancellation route as well as the statutory model withdrawal form. After notifying FLIGALIGA, the consumer must normally send the goods back within 14 days. Refunds are normally made within 14 days after withdrawal, subject to the legal rules concerning receipt or proof of return.',complaintsTitle:'Complaints and disputes',complaintsText:'Customers should first contact FLIGALIGA at fligaliga@hotmail.com, preferably with their order number and a description of the problem. FLIGALIGA will handle complaints fairly and without undue delay. This procedure does not remove statutory consumer rights or the customer\'s right to use an applicable dispute-resolution or court procedure.',productSafetyTitle:'Product safety',productSafetyText:'FLIGALIGA intends to offer only safe consumer products that comply with the rules applicable to them. Depending on the product and supply chain, FLIGALIGA may have distributor, importer or manufacturer responsibilities. Required warnings, instructions and traceability information will be provided with the product or offer where required. Unsafe-product reports and corrective measures will be handled as required by law.',aiTransparencyTitle:'AI-assisted content',aiTransparencyText:'Some FLIGALIGA text, images or other creative material may be created or assisted by AI. Product facts, prices, safety information and final customer-facing content remain FLIGALIGA\'s responsibility and are reviewed before publication. Where applicable law requires AI-generated or manipulated content to be identified, FLIGALIGA will provide the required disclosure.',withdrawalKicker:'THE RETURN VOYAGE',withdrawalTitle:'WITHDRAWAL & CANCELLATION',withdrawalIntro:'PLACEHOLDER — complete the final withdrawal policy and cancellation process before accepting consumer orders.',withdrawalPeriodTitle:'Withdrawal period',withdrawalPeriodText:'[PLACEHOLDER — applicable statutory withdrawal period and product-specific exceptions]',onlineCancellationTitle:'Online cancellation',onlineCancellationText:'Use the cancellation function below to start a withdrawal request. [PLACEHOLDER — connect the final account/order records before launch.]',returnsBlockTitle:'Returns',returnsBlockText:'[PLACEHOLDER — return address, return costs, packaging guidance and refund process]',modelFormTitle:'Model form',modelFormText:'Use the <a href="/withdrawal-form.html">statutory model withdrawal form</a> if you prefer to withdraw in writing. The online cancellation function is an additional route and does not replace the model form.',accessibilityKicker:'ACCESS FOR EVERY TRAVELLER',accessibilityTitle:'ACCESSIBILITY STATEMENT',accessibilityIntro:'FLIGALIGA aims to provide an accessible webshop with readable text, sufficient contrast, keyboard-usable controls, visible focus states, responsive layouts and alternative text when images convey information. The exact statutory accessibility duties depend on FLIGALIGA\'s size, turnover and circumstances and should be verified before launch.',accessibilityCommitmentTitle:'Accessibility commitment',accessibilityCommitmentText:'Accessibility is treated as a design requirement, including readable typography, keyboard navigation, clear controls, language and theme controls, and avoiding information that is conveyed only by colour.',knownLimitationsTitle:'Known limitations',knownLimitationsText:'Some product imagery is decorative or supplied by third parties, and further testing with screen readers, keyboard-only navigation and browser zoom is still appropriate as the webshop evolves.',feedbackTitle:'Feedback',feedbackText:'Report an accessibility problem or request an alternative way to access information at fligaliga@hotmail.com. Please include the page or feature involved and, where possible, your device and browser.',technicalInfoTitle:'Technical information',technicalInfoText:'FLIGALIGA is built with standard HTML, CSS and JavaScript and server components using Node.js and PostgreSQL. Accessibility checks form part of development, but a complete formal accessibility audit has not yet been completed.',ledgerServiceSub:'Explore expeditions and discoveries.',common:'Common',uncommon:'Uncommon',rare:'Rare',veryRare:'Very Rare',unique:'Unique',searchResults:'SEARCH RESULTS',treasuresFound:'TREASURES FOUND',catalogue:'CATALOGUE',treasureSingular:'treasure',treasurePlural:'treasures',discovered:'discovered',badgeCursed:'CURSED',badgeUnknown:'UNKNOWN',badgeNew:'NEW',badgeFeatured:'FEATURED',badgeDiscovery:'DISCOVERY',badgeArtifact:'ARTIFACT',archives:'THE ARCHIVES',retrievingTreasure:'Retrieving treasure...',catalogueNumber:'CATALOGUE NO.',artifact:'ARTIFACT',defaultDescription:'A treasure whose history has yet to be fully uncovered.',unknownArtifact:'Unknown Artifact',unknown:'Unknown',rarityLabel:'RARITY',conditionLabel:'CONDITION',provenanceLabel:'PROVENANCE',availability:'AVAILABILITY',unclassified:'Unclassified',notRecorded:'Not recorded',inVault:'in the vault',unavailable:'Currently unavailable',addToCart:'ADD TO CART',copyLink:'COPY DIRECT TREASURE LINK',otherDiscoveries:'OTHER DISCOVERIES',youMayAlsoFind:'YOU MAY ALSO FIND',treasureNotFound:'Treasure not found',returnToVault:'RETURN TO THE VAULT',linkCopied:'Direct treasure link copied.',loginToViewLedger:'Enter the Vault to view your ledger.',each:'each',ledgerEmpty:'Your ledger is empty.',addedToLedger:'Treasure added to your ledger.',accountCreated:'Account created. You may now enter the vault.',checkoutFailed:'Checkout failed.',paymentNotStarted:'Payment could not be started.',emptyCartConfirm:'Empty your cart?',orderNumber:'Order #',noOrders:'No orders yet.',treasureCatalogued:'Treasure catalogued.',manageTreasures:'MANAGE TREASURES',editProduct:'EDIT',editTreasure:'EDIT TREASURE',saveChanges:'SAVE CHANGES',cancelEdit:'CANCEL EDIT',treasureUpdated:'Treasure updated.',saveFailed:'Could not save treasure.',inStock:'in stock',featuredShort:'FEATURED',newShort:'NEW',contactFormAlert:'Contact form placeholder — connect this form to your email service before launch.',reachVault:'REACH THE VAULT',contactDetails:'CONTACT DETAILS',contactPlaceholder:'Business email: fligaliga@hotmail.com. Other business details will be added before launch.',email:'EMAIL',telephone:'TELEPHONE',address:'ADDRESS',kvk:'KVK',vat:'VAT',reachability:'REACHABILITY',businessEmail:'fligaliga@hotmail.com',businessPhone:'business phone',businessAddress:'registered business address',kvkNumber:'KvK number',vatId:'VAT ID, if applicable',supportHours:'support hours',sendMessage:'SEND A MESSAGE',contactForm:'CONTACT FORM',contactFormPlaceholder:'Send a question to the merchant. We will reply to the email address you provide.',contactFormNotConnected:'CONTACT FORM NOT YET CONNECTED',contactName:'NAME',contactEmail:'EMAIL ADDRESS',contactMessage:'MESSAGE',contactSend:'SEND MESSAGE',contactSending:'SENDING MESSAGE…',contactSent:'Your message has been sent. We will reply by email.',contactFailed:'Could not send your message. Please email fligaliga@hotmail.com directly.',createAccount:'CREATE ACCOUNT',checkoutNote:'Your details are required to prepare delivery. Payment is securely handled by Mollie after you place the order.',fullName:'Full name',emailAddress:'Email address',streetHouse:'Street and house number',countryCode:'Country code (NL)',termsConsent:'I confirm that I have read the <a href="/terms">terms</a> and <a href="/withdrawal">withdrawal information</a>.',treasureName:'TREASURE NAME',description:'DESCRIPTION',price:'PRICE',priceNote:'EUR — enter decimals with a dot, e.g. 14.99',stockInVault:'STOCK IN THE VAULT',imageUrl:'IMAGE URL',imageOptional:'Optional — e.g. /assets/compass.png',selectCategory:'Select category',selectRarity:'Select rarity',featuredTreasure:'FEATURED TREASURE',newArrivalLabel:'NEW ARRIVAL',catalogueTreasure:'CATALOGUE TREASURE',orderPlacedKicker:'THE LEDGER HAS BEEN UPDATED',orderPlacedTitle:'ORDER PLACED',footerVault:'THE VAULT',footerNew:'NEW ARRIVALS',footerLedger:'THE LEDGER',footerMerchant:'ABOUT THE MERCHANT',footerFaq:'FAQ',footerContact:'CONTACT',footerShipping:'SHIPPING',footerReturns:'RETURNS',footerPrivacy:'PRIVACY',footerTerms:'TERMS',footerWithdrawal:'WITHDRAWAL',orderStatusTitle:'ORDER STATUS',paymentResultMissing:'We could not identify this order.',paymentResultChecking:'We are checking your payment status...',paymentResultUnavailable:'We could not load the order status. Please try again from your account.',paymentResultPaid:'Payment received. Your order is confirmed.',paymentResultPending:'Payment is still being confirmed. This page will check again automatically.',paymentResultFailed:'The payment failed. Your reserved stock has been released.',paymentResultExpired:'The payment expired. Your reserved stock has been released.',paymentResultCanceled:'The payment was canceled. Your reserved stock has been released.',paymentResultCancelled:'The payment was canceled. We are checking the final order status...',withdrawalRequests:'WITHDRAWAL REQUESTS',requestNumber:'Request #',noOrderAttached:'No order attached',noReason:'No reason provided',withdrawalReceived:'Received',withdrawalReviewing:'Reviewing',withdrawalCompleted:'Completed',withdrawalRejected:'Rejected',noWithdrawalRequests:'No withdrawal requests yet.',withdrawalUpdateFailed:'Could not update withdrawal request.',cancellationActionKicker:'YOUR RIGHT TO WITHDRAW',cancellationActionTitle:'CANCEL AN ONLINE PURCHASE',cancellationActionText:'Use this form to clearly notify FLIGALIGA that you want to withdraw from an online purchase. We will record your request and contact you about the return and refund process.',orderNumberLabel:'ORDER NUMBER',emailLabel:'EMAIL ADDRESS',reasonLabel:'REASON (OPTIONAL)',withdrawalConfirm:'I confirm that I want to withdraw from this purchase.',withdrawalButton:'HERE TO CANCEL THE AGREEMENT',withdrawalConfirmDialog:'Confirm that you want to withdraw from this purchase.',withdrawalSubmitted:'Your withdrawal request has been recorded. Request #',withdrawalSubmittedEmail:'Your withdrawal request has been recorded. Request #',withdrawalFailed:'Could not submit the withdrawal request.',footerAccessibility:'ACCESSIBILITY'
  },
  nl: {
    navVault:'DE KLUIS',navTreasures:'SCHATTEN',navNew:'NIEUW BINNEN',navLedger:'HET GROOTBOEK',navMerchant:'OVER DE HANDELAAR',
    searchPlaceholder:'Zoek schatten...',cookieNoticeTitle:'COOKIEMELDING',cookieNoticeText:'FLIGALIGA gebruikt noodzakelijke opslag voor inloggen, afrekenen en sitevoorkeuren. Optionele Google Analytics helpt ons inzicht te krijgen in bezoeken en de webshop te verbeteren; dit wordt alleen geactiveerd nadat je analytics expliciet toestaat.',cookieNoticePrivacy:'Lees de privacyverklaring',cookieSettingsFab:'COOKIE-INSTELLINGEN',cookieSettingsKicker:'PRIVACY-INSTELLINGEN',cookieSettingsTitle:'COOKIE-INSTELLINGEN',cookieSettingsIntro:'Noodzakelijke opslag ondersteunt de basisfuncties van de webshop en kan niet worden uitgeschakeld. Optionele analytics staat uit totdat je dit toestaat.',cookieNecessaryTitle:'NOODZAKELIJK',cookieNecessaryText:'Sessie- en voorkeurenopslag voor inloggen, afrekenen en taal-/themainstellingen.',cookieAnalyticsTitle:'ANALYTICS',cookieAnalyticsText:'Optionele Google Analytics-metingen om bezoeken te begrijpen en de webshop te verbeteren.',cookieAlwaysOn:'ALTIJD AAN',cookieSave:'VOORKEUREN OPSLAAN',cookieSettingsPrivacy:'PRIVACYVERKLARING',cookieNoticeAccept:'ANALYTICS TOESTAAN',cookieNoticeReject:'ANALYTICS WEIGEREN',cookieNoticeSettings:'INSTELLINGEN',admin:'BEHEER',enter:'BINNENKOMEN',leave:'VERLATEN',welcomeTo:'WELKOM BIJ',vault:'DE KLUIS',
    heroSub:'Schatten verzameld van plaatsen<br>die beter vergeten hadden kunnen blijven.',enterVault:'BETREED DE KLUIS',allTreasures:'ALLE SCHATTEN',
    artifacts:'ARTEFACTEN',collectibles:'VERZAMELOBJECTEN',oddities:'RARITEITEN',mysteryBoxes:'MYSTERYBOXEN',
    recentlyDiscovered:'RECENT ONTDEKT',featuredTreasures:'UITGELICHTE SCHATTEN',clearFilter:'FILTER WISSEN ×',
    fastShipping:'SNEL & VEILIG VERZONDEN',shippingSub:'Je schatten veilig bij je thuis.',secureReturns:'VEILIG RETOURNEREN',
    returnsSub:'Een duidelijk pad als plannen veranderen.',uniqueAuthentic:'UNIEK & AUTHENTIEK',uniqueSub:'Elk voorwerp heeft een verhaal.',
    contactMerchant:'CONTACT MET DE HANDELAAR',contactSub:'Een vraag? We helpen je graag.',merchantOffice:'HET KANTOOR VAN DE HANDELAAR',
    enterTheVault:'BETREED DE KLUIS',returningTraveler:'TERUGKERENDE BEZOEKER',newArrival:'NIEUWE BEZOEKER',
    username:'Gebruikersnaam',password:'Wachtwoord',chooseUsername:'Kies een gebruikersnaam',choosePassword:'Kies een wachtwoord',
    yourLedger:'JOUW GROOTBOEK',deliveryDetails:'BEZORGGEGEVENS',completeOrder:'BESTELLING AFRONDEN',placeOrder:'BESTELLING & BETALEN',
    cancel:'ANNULEREN',merchant:'DE HANDELAAR',adminLedger:'BEHEERDER',addTreasure:'SCHAT TOEVOEGEN',orders:'BESTELLINGEN',
    cart:'DE WINKELWAGEN',emptyCart:'WINKELWAGEN LEGEN',checkout:'AFREKENEN',footerTagline:'Sommige schatten zijn niet bedoeld om gevonden te worden...',classification:'Classificatie',origin:'Herkomst',viewArtifact:'BEKIJK ARTEFACT',recentlyCatalogued:'RECENT GECATALOGISEERD',completeCollection:'DE VOLLEDIGE COLLECTIE',newArrivalsTitle:'NIEUW BINNEN',treasuresTitle:'SCHATTEN',latestDiscoveries:'De nieuwste ontdekkingen die de Kluiskamer zijn binnengekomen.',browseCatalogue:'Bekijk de volledige collectie artefacten, curiositeiten, rariteiten en mysteries.',noTreasures:'Er zijn momenteel geen schatten gecatalogiseerd.',discoverySingular:'ontdekking',discoveryPlural:'ontdekkingen',inView:'in beeld',ledgerKicker:'HET ARCHIEF',ledgerTitle:'HET GROOTBOEK',ledgerIntro:'Een verslag van expedities, ontdekkingen en schatten die door de Kluiskamer zijn gegaan.',ledgerRecentTitle:'Recente ontdekkingen',ledgerRecentText:'Elke catalogusvermelding begint als een verhaal: waar het werd gevonden, wat erover bekend is en wat een mysterie blijft.',ledgerCatalogueTitle:'De catalogus',ledgerCatalogueText:'Bekijk de huidige collectie via De Kluiskamer, Nieuw Binnen en de afzonderlijke artefactpagina’s. Elk product heeft een eigen deelbare archiefpagina.',ledgerMerchantTitle:'Een notitie van de handelaar',ledgerMerchantText:'Het Grootboek is bewust onvolledig. Sommige herkomsten zijn verloren gegaan, sommige details worden betwist en sommige schatten kunnen beter onverklaard blijven.',merchantKicker:'DEGENE DIE DE KLUIS BEHEERT',merchantTitle:'OVER DE HANDELAAR',merchantIntro:'Welkom, reiziger. De Kluiskamer is een gefictionaliseerd concept voor een antiek- en rariteitenwinkel, gebouwd rond het idee dat ieder voorwerp een verhaal verdient.',merchantPhilosophyTitle:'De filosofie',merchantPhilosophyText:'FLIGALIGA is deels catalogus en deels expeditiedagboek. De beeldtaal is bewust ouderwets: messing, perkament, kaarslicht en diepe schaduwen.',merchantCollectTitle:'Wat we verzamelen',merchantCollectText:'Artefacten, curiositeiten, nautische relikwieën, rariteiten en voorwerpen met een ongebruikelijke geschiedenis — echt, verzonnen of nog wachtend om ontdekt te worden.',merchantFinePrintTitle:'De kleine lettertjes',merchantFinePrintText:'Vervang dit verhaal vóór de lancering door je echte bedrijfsverhaal, bedrijfsgegevens en contactinformatie.',faqKicker:'VRAGEN VAN ONDERWEG',faqTitle:'VEELGESTELDE VRAGEN',faqIntro:'Een eerste FAQ voor de Kluiskamer. Productspecifieke informatie gaat altijd voor op deze algemene antwoorden.',faqFindQuestion:'Hoe vind ik een specifieke schat?',faqFindAnswer:'Gebruik het zoekveld, bekijk de pagina’s De Kluiskamer of Nieuw Binnen, of open de directe archieflink van een product.',faqShareQuestion:'Kan ik een product rechtstreeks delen?',faqShareAnswer:'Ja. Elke schat heeft een eigen URL, zodat je het adres vanaf de productpagina kunt kopiëren en direct kunt delen.',faqDeliveryQuestion:'Hoe lang duurt de bezorging?',faqDeliveryAnswer:'De bezorgtijden zijn momenteel tijdelijke voorbeeldtekst. Voeg vóór de lancering je echte vervoerder, verwerkingstijd en bezorgschatting toe.',faqReturnQuestion:'Kan ik een online aankoop retourneren?',faqReturnAnswer:'Voor veel online consumentenaankopen in de EU geldt een herroepingstermijn van 14 dagen, met uitzonderingen. Bekijk de retourpagina voor de concepttekst.',faqContactQuestion:'Hoe neem ik contact op met de handelaar?',faqContactAnswer:'Gebruik de Contactpagina. Voeg vóór de lancering je echte e-mailadres en telefoonnummer toe.',faqAuthenticQuestion:'Zijn de schatten authentiek?',faqAuthenticAnswer:'Gebruik dit antwoord voor je echte beleid rond herkomst en authenticiteit. Elke productpagina moet duidelijk beschrijven wat over het voorwerp bekend is.',contactKicker:'HET KANTOOR VAN DE HANDELAAR',contactTitle:'CONTACT MET DE HANDELAAR',contactIntro:'Vragen over een schat, een bestelling of de expeditie? Deze pagina staat klaar voor je echte contactgegevens.',shippingKicker:'DE EXPEDITIE',shippingTitle:'VERZENDING & BEZORGING',shippingIntro:'Op deze pagina staan de bezorgregels voor FLIGALIGA-bestellingen. Vóór de aankoop moeten de klant het bezorggebied, de bezorgmethode, de verzendkosten en de verwachte bezorgtermijn duidelijk worden getoond. De exacte landen, vervoerder en prijzen voor de start zijn nog [VÓÓR DE LANCERING INVULLEN].',dispatchTitle:'Verzending',dispatchText:'Bestellingen worden na betaling klaargemaakt en verzonden met de bezorgmethode die bij het afrekenen wordt getoond. De klant ziet de toepasselijke verzendkosten en de verwachte bezorgtermijn voordat de bestelling wordt geplaatst.',deliveryEstimatesTitle:'Bezorgschattingen',deliveryEstimatesText:'Tenzij uitdrukkelijk een andere leveringstermijn is afgesproken, moet een bestelling normaal binnen 30 dagen worden geleverd. Bij niet-tijdige levering kan de consument de rechten uitoefenen die uit het toepasselijke consumentenrecht volgen, waaronder ontbinding wanneer aan de wettelijke voorwaarden is voldaan.',trackingTitle:'Track & trace',trackingText:'Wanneer track & trace beschikbaar is, bevat de verzend- of orderbevestiging de trackingcode of link. Het risico van verlies of beschadiging ligt normaal bij FLIGALIGA totdat de consument de goederen ontvangt, behalve wanneer de consument zelfstandig een vervoerder kiest die FLIGALIGA niet heeft aangeboden.',internationalOrdersTitle:'Internationale bestellingen',internationalOrdersText:'Verzendgebied bij de start: [VÓÓR DE LANCERING INVULLEN]. Wanneer FLIGALIGA later buiten Nederland verkoopt, worden de landen, verzendkosten, verwachte bezorgtermijnen en eventuele toepasselijke invoerrechten, belastingen of beperkingen vooraf duidelijk vermeld.',returnsKicker:'DE RETOURREIS',returnsTitle:'RETOUR & HERROEPING',returnsIntro:'Op deze pagina staan de wettelijke regels voor herroeping en retourneren bij online consumentenaankopen. De bedrijfsgebonden retourinformatie, waaronder het retouradres en de regeling voor retourkosten, moet vóór de lancering definitief worden ingevuld.',withdrawal14Title:'14 dagen bedenktijd',withdrawal14Text:'Bij een online aankoop door een consument geldt normaal 14 kalenderdagen bedenktijd en hoeft de consument geen reden voor herroeping te geven. Bij goederen begint de termijn normaal op de dag na ontvangst. Bij meerdere afzonderlijk geleverde goederen begint de termijn normaal wanneer het laatste product is ontvangen. Er bestaan wettelijke uitzonderingen; wanneer die relevant zijn, worden ze vóór de aankoop duidelijk vermeld.',returnCostsTitle:'Retourkosten',returnCostsText:'De consument betaalt normaal de directe retourkosten, tenzij FLIGALIGA heeft afgesproken deze te dragen of de consument niet correct vooraf over deze kosten heeft geïnformeerd. Bij een geldige herroeping betaalt FLIGALIGA de aankoopprijs en de kosten van de standaardbezorging normaal binnen 14 dagen terug, met inachtneming van de wettelijke mogelijkheid om te wachten tot de goederen of een bewijs van terugzending zijn ontvangen.',defectiveTitle:'Beschadigde of verkeerde artikelen',defectiveText:'Het herroepingsrecht staat los van wettelijke conformiteitsrechten. Wanneer een product defect, beschadigd of incompleet is, niet overeenkomt met de beschrijving of niet de levensduur heeft die redelijkerwijs mag worden verwacht, kan de klant zich beroepen op zijn wettelijke rechten. FLIGALIGA past de oplossing toe die volgens de omstandigheden en de wet is vereist.',beforeLaunchTitle:'Vóór de lancering',beforeLaunchText:'Vóór de lancering moeten het retouradres, de retourkosten, het verzendgebied en eventuele productspecifieke uitzonderingen op het herroepingsrecht definitief worden ingevuld. De online annuleringsmogelijkheid en het wettelijke modelformulier zijn beide beschikbaar; de ene vervangt de andere niet.',privacyKicker:'HET PRIVÉGROOTBOEK',privacyTitle:'PRIVACY',privacyIntro:'Deze privacyverklaring legt uit welke persoonsgegevens FLIGALIGA verwerkt, waarom, op welke wettelijke grondslag, met wie gegevens worden gedeeld, hoe lang ze worden bewaard en hoe bezoekers en klanten hun privacyrechten kunnen uitoefenen. De geregistreerde bedrijfsidentiteit en definitieve productiegegevens moeten vóór de lancering worden ingevuld.',businessIdentityTitle:'Bedrijfsidentiteit',businessIdentityText:'FLIGALIGA is de handelsnaam van deze webshop. Vóór de lancering moet hier de juridische ondernemer worden vermeld met de geregistreerde naam, het bedrijfsadres, KvK-nummer, btw-id, telefoonnummer of andere vereiste contactmogelijkheid en het e-mailadres voor privacyvragen. Huidig klantcontact: fligaliga@hotmail.com.',personalDataTitle:'Persoonsgegevens',personalDataText:'Afhankelijk van het gebruik van de webshop kan FLIGALIGA een gebruikersnaam en wachtwoordhash verwerken; bestel- en productgegevens; naam; bezorgadres; postcode; woonplaats; land; e-mailadres; betaalidentificatie en betaalstatus via Mollie; gegevens uit herroepings- of annuleringsverzoeken; klantberichten; sessiegegevens en toestemmingsvoorkeuren. We proberen alleen gegevens te verzamelen die voor het betreffende doel nodig zijn.',legalBasesTitle:'Rechtsgrondslagen',legalBasesText:'Voor accounts, bestellingen, bezorging, betaling en het behandelen van retouren of herroepingen is verwerking in het algemeen nodig om de overeenkomst uit te voeren of om op verzoek van de klant stappen te zetten vóór het sluiten van een overeenkomst. Bepaalde gegevens moeten op grond van de wet worden bewaard. Beveiliging en fraudepreventie kunnen, waar toegestaan, op een gerechtvaardigd belang berusten. Optionele Google Analytics wordt alleen na expliciete toestemming gebruikt.',processorsTitle:'Verwerkers',processorsText:'Dienstverleners kunnen alleen persoonsgegevens ontvangen voor zover dat nodig is voor hun rol. De huidige categorieën zijn hosting/infrastructuur, PostgreSQL-database-infrastructuur, Mollie voor betalingen, bezorgdiensten, Resend voor transactionele e-mail wanneer dit is ingeschakeld en Google Analytics voor optionele metingen na toestemming. Voor de vormgeving gebruikt de site Google Fonts; daarvoor kan de browser verbinding maken met Google. De exacte productiepartners en vereiste verwerkersovereenkomsten moeten vóór de lancering worden vastgelegd.',dataSharingTitle:'Ontvangers en internationale doorgifte',dataSharingText:'FLIGALIGA verkoopt geen persoonsgegevens van klanten. Gegevens kunnen worden gedeeld met dienstverleners die nodig zijn om de webshop te laten werken en bestellingen uit te voeren. Voor Google Analytics wordt meetinformatie pas na toestemming naar Google gestuurd. In de huidige meetvoorwaarden noemt Google Google Ireland Limited als zijn Europese eindverwerkingsverantwoordelijke voor Europese persoonsgegevens van verwerkingsverantwoordelijken; wanneer gegevens buiten de EER worden doorgegeven, beschrijft Google daarvoor toepasselijke mechanismen zoals adequaatheidsbesluiten of standaardcontractbepalingen.',automatedDecisionTitle:'Geautomatiseerde besluitvorming',automatedDecisionText:'FLIGALIGA gebruikt momenteel geen persoonsgegevens om uitsluitend op basis van geautomatiseerde verwerking besluiten over klanten te nemen die juridische of vergelijkbaar belangrijke gevolgen hebben.',privacyComplaintTitle:'Privacyklachten',privacyComplaintText:'Vragen of verzoeken over privacy kunnen worden gestuurd naar fligaliga@hotmail.com. Je hebt ook het recht om een klacht in te dienen bij de Autoriteit Persoonsgegevens wanneer je denkt dat FLIGALIGA persoonsgegevens onrechtmatig verwerkt.',retentionRightsTitle:'Bewaartermijnen & rechten',retentionRightsText:'FLIGALIGA bewaart persoonsgegevens niet langer dan nodig is, behalve wanneer de wet een langere termijn verplicht. Fiscale en administratieve gegevens kunnen minimaal 7 jaar moeten worden bewaard. Accountgegevens kunnen worden verwijderd wanneer ze niet meer nodig zijn, met inachtneming van wettelijke bewaarplichten en lopende transacties. Je kunt, waar van toepassing, verzoeken om inzage, correctie, verwijdering, beperking of overdraagbaarheid en bezwaar maken. Toestemming kan altijd worden ingetrokken voor verwerkingen die op toestemming zijn gebaseerd. Verzoeken kunnen naar fligaliga@hotmail.com; FLIGALIGA reageert normaal binnen 1 maand en kan om identiteitscontrole vragen.',cookiesTitle:'Cookies',cookiesText:'De webshop gebruikt een noodzakelijke sessiecookie voor inloggen en checkout en slaat taal- en themavoorkeuren lokaal in de browser op. Optionele Google Analytics wordt alleen na expliciete toestemming geladen. FLIGALIGA gebruikt geen advertentiefuncties. De bewaartermijn van GA4-gegevens volgt de ingestelde GA4-property en moet vóór de lancering in de definitieve privacyverklaring worden vastgelegd.',termsKicker:'DE VOORWAARDEN VAN DE HANDELAAR',termsTitle:'ALGEMENE VOORWAARDEN',termsIntro:'PLACEHOLDER — vervang vóór de lancering door de definitieve consumentenvoorwaarden.',businessDetailsTitle:'Bedrijfsgegevens',businessDetailsText:'Vóór het aannemen van echte consumentenbestellingen moet hier de juridische ondernemer worden vermeld: geregistreerde naam, eventuele handelsnaam, adresgegevens zoals wettelijk vereist, e-mailadres, telefoonnummer of andere toegestane contactmogelijkheid, KvK-nummer en btw-id. Huidig klantcontact: fligaliga@hotmail.com. Ook de klachtenprocedure en eventuele aansluiting bij een geschilleninstantie moeten worden vermeld.',productsPricesTitle:'Producten & prijzen',productsPricesText:'Bij iedere aanbieding moeten de belangrijkste kenmerken worden vermeld die nodig zijn om de aankoop goed te beoordelen, zoals materialen, afmetingen, staat en andere belangrijke eigenschappen. Consumentenprijzen moeten de totale prijs inclusief toepasselijke belastingen en onvermijdbare extra kosten tonen. Belangrijke productgebonden beperkingen of uitzonderingen moeten vóór het bestellen duidelijk zijn.',orderingPaymentTitle:'Bestellen & betalen',orderingPaymentText:'De klant kan de winkelmand controleren, de benodigde contact- en bezorggegevens invullen, de toepasselijke voorwaarden en herroepingsinformatie accepteren en een beschikbare betaalmethode kiezen. De definitieve bestelknop maakt duidelijk dat een betalingsverplichting ontstaat. Betalingen worden via Mollie verwerkt. Na de bestelling ontvangt de klant de wettelijk vereiste informatie op een duurzame gegevensdrager, zoals per e-mail.',deliveryTitle:'Bezorging',deliveryText:'FLIGALIGA vermeldt vóór de aankoop waar wordt bezorgd, welke bezorgmethode wordt gebruikt, wat de verzendkosten zijn en wat de verwachte bezorgtermijn is. Tenzij een andere termijn is afgesproken, moet de levering normaal binnen 30 dagen plaatsvinden. Het risico van verlies of beschadiging ligt normaal bij FLIGALIGA totdat de consument de goederen ontvangt.',legalGuaranteeTitle:'Wettelijke garantie & klachten',legalGuaranteeText:'Consumenten hebben wettelijke conformiteitsrechten wanneer een product niet aan de overeenkomst voldoet. In Nederland bestaat geen vaste ene wettelijke garantietermijn; wat de consument redelijkerwijs mag verwachten hangt af van het product en de omstandigheden. Een eventuele commerciële garantie is aanvullend en mag wettelijke consumentenrechten niet beperken.',otherTermsTitle:'Overige voorwaarden',otherTermsText:'Deze voorwaarden sluiten geen dwingende consumentenbescherming uit en beperken die niet. Een uitzondering op het herroepingsrecht wordt alleen gebruikt wanneer er daadwerkelijk een wettelijke uitzondering geldt en de klant daar vóór de aankoop over is geïnformeerd. Bedrijfsgegevens, verzendkosten, retouradres en andere praktische gegevens worden vóór de lancering definitief ingevuld.',governingLawTitle:'Toepasselijk recht',governingLawText:'Voor zover dwingend consumentenrecht niet anders bepaalt, is Nederlands recht van toepassing op aankopen via FLIGALIGA. Niets in deze voorwaarden neemt verplichte consumentenbescherming weg die op een consument in diens woonland van toepassing is.',withdrawalTermsTitle:'Herroeping en annulering',withdrawalTermsText:'Consumenten hebben normaal 14 kalenderdagen bedenktijd bij een online aankoop van goederen en hoeven voor herroeping geen reden te geven. FLIGALIGA biedt de vereiste online annuleringsmogelijkheid én het wettelijke modelformulier voor herroeping. Na de melding moet de consument de goederen normaal binnen 14 dagen terugsturen. Terugbetalingen vinden normaal binnen 14 dagen na herroeping plaats, met inachtneming van de wettelijke regels over ontvangst of bewijs van terugzending.',complaintsTitle:'Klachten en geschillen',complaintsText:'Klanten kunnen eerst contact opnemen via fligaliga@hotmail.com, bij voorkeur met het ordernummer en een duidelijke beschrijving van het probleem. FLIGALIGA behandelt klachten eerlijk en zonder onnodige vertraging. Deze procedure beperkt geen wettelijke consumentenrechten en ook niet het recht om gebruik te maken van een toepasselijke geschillenregeling of gerechtelijke procedure.',productSafetyTitle:'Productveiligheid',productSafetyText:'FLIGALIGA is van plan alleen veilige consumentenproducten aan te bieden die voldoen aan de regels die op het product van toepassing zijn. Afhankelijk van het product en de toeleveringsketen kan FLIGALIGA verplichtingen hebben als distributeur, importeur of fabrikant. Vereiste waarschuwingen, instructies en traceerbaarheidsinformatie worden bij het product of de aanbieding verstrekt wanneer dat wettelijk nodig is. Meldingen over onveilige producten en corrigerende maatregelen worden volgens de wet afgehandeld.',aiTransparencyTitle:'AI-ondersteunde inhoud',aiTransparencyText:'Sommige teksten, afbeeldingen of andere creatieve inhoud van FLIGALIGA kunnen met AI zijn gemaakt of ondersteund. Productfeiten, prijzen, veiligheidsinformatie en definitieve klantgerichte inhoud blijven de verantwoordelijkheid van FLIGALIGA en worden vóór publicatie gecontroleerd. Wanneer de toepasselijke wet AI-gegenereerde of gemanipuleerde inhoud herkenbaar moet maken, zorgt FLIGALIGA voor de vereiste vermelding.',withdrawalKicker:'DE RETOURREIS',withdrawalTitle:'HERROEPING & ANNULERING',withdrawalIntro:'PLACEHOLDER — maak het definitieve herroepingsbeleid en annuleringsproces compleet vóórdat je consumentenbestellingen accepteert.',withdrawalPeriodTitle:'Herroepingstermijn',withdrawalPeriodText:'[PLACEHOLDER — toepasselijke wettelijke termijn en productgebonden uitzonderingen]',onlineCancellationTitle:'Online annuleren',onlineCancellationText:'Gebruik de annuleringsfunctie hieronder om een herroepingsverzoek te starten. [PLACEHOLDER — koppel vóór de lancering de definitieve account-/ordergegevens.]',returnsBlockTitle:'Retourneren',returnsBlockText:'[PLACEHOLDER — retouradres, retourkosten, verpakkingsrichtlijnen en terugbetalingsproces]',modelFormTitle:'Modelformulier',modelFormText:'Gebruik het <a href="/withdrawal-form.html">wettelijke modelformulier voor herroeping</a> als je schriftelijk wilt herroepen. De online annuleringsmogelijkheid is een aanvullende route en vervangt het modelformulier niet.',accessibilityKicker:'TOEGANG VOOR IEDERE REIZIGER',accessibilityTitle:'TOEGANKELIJKHEIDSVERKLARING',accessibilityIntro:'FLIGALIGA streeft naar een toegankelijke webshop met leesbare tekst, voldoende contrast, toetsenbordbediening, duidelijke focusstaten, responsive vormgeving en alternatieve tekst wanneer afbeeldingen informatie overbrengen. De precieze wettelijke toegankelijkheidsplichten hangen af van onder meer omvang, omzet en omstandigheden; de reikwijdte en een eventuele vrijstelling voor micro-ondernemingen moeten vóór de lancering worden gecontroleerd.',accessibilityCommitmentTitle:'Toegankelijkheidsbelofte',accessibilityCommitmentText:'Bij de ontwikkeling van de webshop wordt toegankelijkheid als ontwerpeis meegenomen, waaronder leesbare typografie, toetsenbordnavigatie, duidelijke bediening, taal- en themacontroles en het vermijden van informatie die alleen via kleur wordt overgebracht.',knownLimitationsTitle:'Bekende beperkingen',knownLimitationsText:'Sommige productafbeeldingen zijn decoratief of worden door derden aangeleverd, en verdere tests met schermlezers, alleen-toetsenbordnavigatie en browserzoom blijven passend naarmate de webshop verder wordt ontwikkeld.',feedbackTitle:'Feedback',feedbackText:'Meld een toegankelijkheidsprobleem of vraag om een alternatieve manier om informatie te ontvangen via fligaliga@hotmail.com. Vermeld bij voorkeur de pagina of functie en, wanneer mogelijk, je apparaat en browser.',technicalInfoTitle:'Technische informatie',technicalInfoText:'FLIGALIGA is gebouwd met standaard HTML, CSS en JavaScript en servercomponenten op Node.js en PostgreSQL. Toegankelijkheidscontroles maken deel uit van het ontwikkelproces, maar er is nog geen volledige formele toegankelijkheidsaudit uitgevoerd.',ledgerServiceSub:'Bekijk expedities en ontdekkingen.',common:'Gewoon',uncommon:'Ongewoon',rare:'Zeldzaam',veryRare:'Zeer zeldzaam',unique:'Uniek',searchResults:'ZOEKRESULTATEN',treasuresFound:'GEVONDEN SCHATTEN',catalogue:'CATALOGUS',treasureSingular:'schat',treasurePlural:'schatten',discovered:'gevonden',badgeCursed:'VERVLOEKT',badgeUnknown:'ONBEKEND',badgeNew:'NIEUW',badgeFeatured:'UITGELICHT',badgeDiscovery:'ONTDEKKING',badgeArtifact:'ARTEFACT',archives:'DE ARCHIEVEN',retrievingTreasure:'Schat wordt opgehaald...',catalogueNumber:'CATALOGUS NR.',artifact:'ARTEFACT',defaultDescription:'Een schat waarvan de volledige geschiedenis nog moet worden onthuld.',unknownArtifact:'Onbekend artefact',unknown:'Onbekend',rarityLabel:'ZELDZAAMHEID',conditionLabel:'STAAT',provenanceLabel:'HERKOMSTGESCHIEDENIS',availability:'BESCHIKBAARHEID',unclassified:'Ongeclassificeerd',notRecorded:'Niet vastgelegd',inVault:'in de kluis',unavailable:'Momenteel niet beschikbaar',addToCart:'IN WINKELWAGEN',copyLink:'DIRECTE SCHATLINK KOPIËREN',otherDiscoveries:'ANDERE ONTDEKKINGEN',youMayAlsoFind:'DIT KUN JE OOK VINDEN',treasureNotFound:'Schat niet gevonden',returnToVault:'TERUG NAAR DE KLUIS',linkCopied:'Directe schatlink gekopieerd.',loginToViewLedger:'Betreed de Kluiskamer om je Grootboek te bekijken.',each:'per stuk',ledgerEmpty:'Je Grootboek is leeg.',addedToLedger:'Schat toegevoegd aan je Grootboek.',accountCreated:'Account aangemaakt. Je kunt de Kluiskamer nu betreden.',checkoutFailed:'Afrekenen mislukt.',paymentNotStarted:'Betaling kon niet worden gestart.',emptyCartConfirm:'Je winkelwagen leegmaken?',orderNumber:'Bestelling #',noOrders:'Nog geen bestellingen.',treasureCatalogued:'Schat gecatalogiseerd.',manageTreasures:'SCHATTEN BEHEREN',editProduct:'BEWERKEN',editTreasure:'SCHAT BEWERKEN',saveChanges:'WIJZIGINGEN OPSLAAN',cancelEdit:'BEWERKING ANNULEREN',treasureUpdated:'Schat bijgewerkt.',saveFailed:'Schat kon niet worden opgeslagen.',inStock:'op voorraad',featuredShort:'UITGELICHT',newShort:'NIEUW',contactFormAlert:'Contactformulier is nog een voorbeeld — koppel het vóór de lancering aan je e-maildienst.',reachVault:'BEREIK DE KLUIS',contactDetails:'CONTACTGEGEVENS',contactPlaceholder:'Zakelijk e-mailadres: fligaliga@hotmail.com. Overige bedrijfsgegevens worden vóór de lancering toegevoegd.',email:'E-MAIL',telephone:'TELEFOON',address:'ADRES',kvk:'KVK',vat:'BTW',reachability:'BEREIKBAARHEID',businessEmail:'zakelijk e-mailadres',businessPhone:'zakelijk telefoonnummer',businessAddress:'vestigingsadres',kvkNumber:'KvK-nummer',vatId:'btw-nummer, indien van toepassing',supportHours:'openingstijden klantenservice',sendMessage:'STUUR EEN BERICHT',contactForm:'CONTACTFORMULIER',contactFormPlaceholder:'Stuur een vraag naar de handelaar. We antwoorden op het e-mailadres dat je opgeeft.',contactFormNotConnected:'CONTACTFORMULIER NOG NIET VERBONDEN',contactName:'NAAM',contactEmail:'E-MAILADRES',contactMessage:'BERICHT',contactSend:'BERICHT VERSTUREN',contactSending:'BERICHT WORDT VERSTUURD…',contactSent:'Je bericht is verzonden. We antwoorden per e-mail.',contactFailed:'Je bericht kon niet worden verzonden. Mail rechtstreeks naar fligaliga@hotmail.com.',createAccount:'ACCOUNT AANMAKEN',checkoutNote:'Je gegevens zijn nodig om de bezorging voor te bereiden. De betaling wordt na het plaatsen van de bestelling veilig afgehandeld via Mollie.',fullName:'Volledige naam',emailAddress:'E-mailadres',streetHouse:'Straat en huisnummer',countryCode:'Landcode (NL)',termsConsent:'Ik bevestig dat ik de <a href="/terms">voorwaarden</a> en <a href="/withdrawal">informatie over herroeping</a> heb gelezen.',treasureName:'SCHATNAAM',description:'BESCHRIJVING',price:'PRIJS',priceNote:'EUR — gebruik een punt voor decimalen, bijvoorbeeld 14.99',stockInVault:'VOORRAAD IN DE KLUIS',imageUrl:'AFBEELDINGS-URL',imageOptional:'Optioneel — bijvoorbeeld /assets/compass.png',selectCategory:'Selecteer categorie',selectRarity:'Selecteer zeldzaamheid',featuredTreasure:'UITGELICHTE SCHAT',newArrivalLabel:'NIEUW BINNEN',catalogueTreasure:'SCHAT CATALOGISEREN',orderPlacedKicker:'HET GROOTBOEK IS BIJGEWERKT',orderPlacedTitle:'BESTELLING GEPLAATST',footerVault:'DE KLUIS',footerNew:'NIEUW BINNEN',footerLedger:'HET GROOTBOEK',footerMerchant:'OVER DE HANDELAAR',footerFaq:'FAQ',footerContact:'CONTACT',footerShipping:'VERZENDING',footerReturns:'RETOUR',footerPrivacy:'PRIVACY',footerTerms:'VOORWAARDEN',footerWithdrawal:'HERROEPING',orderStatusTitle:'BESTELLING STATUS',paymentResultMissing:'We konden deze bestelling niet identificeren.',paymentResultChecking:'We controleren de betaalstatus van je bestelling...',paymentResultUnavailable:'We konden de bestelstatus niet laden. Probeer het opnieuw vanuit je account.',paymentResultPaid:'Betaling ontvangen. Je bestelling is bevestigd.',paymentResultPending:'De betaling wordt nog bevestigd. Deze pagina controleert automatisch opnieuw.',paymentResultFailed:'De betaling is mislukt. De gereserveerde voorraad is vrijgegeven.',paymentResultExpired:'De betaling is verlopen. De gereserveerde voorraad is vrijgegeven.',paymentResultCanceled:'De betaling is geannuleerd. De gereserveerde voorraad is vrijgegeven.',paymentResultCancelled:'De betaling is geannuleerd. We controleren de definitieve bestelstatus...',withdrawalRequests:'HERROEPINGSVERZOEKEN',requestNumber:'Verzoek #',noOrderAttached:'Geen bestelling gekoppeld',noReason:'Geen reden opgegeven',withdrawalReceived:'Ontvangen',withdrawalReviewing:'In behandeling',withdrawalCompleted:'Afgerond',withdrawalRejected:'Afgewezen',noWithdrawalRequests:'Nog geen herroepingsverzoeken.',withdrawalUpdateFailed:'Herroepingsverzoek kon niet worden bijgewerkt.',cancellationActionKicker:'JE RECHT OP HERROEPING',cancellationActionTitle:'ONLINE AANKOOP HERROEPEN',cancellationActionText:'Gebruik dit formulier om FLIGALIGA duidelijk te laten weten dat je van een online aankoop wilt afzien. We registreren je verzoek en nemen contact met je op over retour en terugbetaling.',orderNumberLabel:'BESTELNUMMER',emailLabel:'E-MAILADRES',reasonLabel:'REDEN (OPTIONEEL)',withdrawalConfirm:'Ik bevestig dat ik deze aankoop wil herroepen.',withdrawalButton:'HIER DE OVEREENKOMST ONTBINDEN',withdrawalConfirmDialog:'Bevestig dat je deze aankoop wilt herroepen.',withdrawalSubmitted:'Je herroepingsverzoek is geregistreerd. Verzoek #',withdrawalSubmittedEmail:'Je herroepingsverzoek is geregistreerd. Verzoek #',withdrawalFailed:'Het herroepingsverzoek kon niet worden verzonden.',footerAccessibility:'TOEGANKELIJKHEID'
  }
};

function t(key,fallback=''){const lang=currentLanguage();return translations[lang]?.[key]??translations.en?.[key]??fallback;}

let lastScrollY=window.scrollY;
let scrollTicking=false;
let scrollDirection=0;
let directionDistance=0;
let headerShowTimer=null;

function updateHeaderVisibility(){
  const header=document.querySelector('.site-header');
  if(!header)return;

  const currentY=window.scrollY;
  const delta=currentY-lastScrollY;
  const direction=delta>0?1:delta<0?-1:0;

  if(currentY<=12){
    clearTimeout(headerShowTimer);
    headerShowTimer=null;
    header.classList.remove('header-hidden');
    scrollDirection=0;
    directionDistance=0;
  }else if(direction!==0){
    if(direction!==scrollDirection){
      scrollDirection=direction;
      directionDistance=0;
    }

    directionDistance+=Math.abs(delta);

    if(direction>0){
      clearTimeout(headerShowTimer);
      headerShowTimer=null;
      if(directionDistance>=40) header.classList.add('header-hidden');
    }else if(direction<0 && !headerShowTimer && directionDistance>=40){
      headerShowTimer=setTimeout(()=>{
        header.classList.remove('header-hidden');
        headerShowTimer=null;
      },220);
    }
  }

  lastScrollY=currentY;
  scrollTicking=false;
}

window.addEventListener('scroll',()=>{
  if(!scrollTicking){
    scrollTicking=true;
    requestAnimationFrame(updateHeaderVisibility);
  }
},{passive:true});

const CONSENT_VERSION='1';
const CONSENT_KEY='fligaliga-consent-v'+CONSENT_VERSION;
let analyticsReady=false;

function readConsent(){
  try{
    const value=JSON.parse(localStorage.getItem(CONSENT_KEY)||'null');
    if(!value||value.version!==CONSENT_VERSION||!['granted','denied'].includes(value.analytics))return null;
    return value;
  }catch{return null;}
}
function storeConsent(analytics){
  const value={version:CONSENT_VERSION,analytics:analytics?'granted':'denied',timestamp:new Date().toISOString()};
  try{localStorage.setItem(CONSENT_KEY,JSON.stringify(value));}catch{}
  return value;
}
function deleteAnalyticsCookies(){
  document.cookie.split(';').forEach(cookie=>{
    const name=cookie.split('=')[0].trim();
    if(!name.startsWith('_ga'))return;
    document.cookie=name+'=; Max-Age=0; path=/; SameSite=Lax';
    document.cookie=name+'=; Max-Age=0; path=/; domain='+location.hostname+'; SameSite=Lax';
  });
}
function trackAnalyticsPageView(){
  if(!analyticsReady||typeof window.gtag!=='function')return;
  window.gtag('event','page_view',{
    page_title:document.title,
    page_location:location.href,
    page_path:location.pathname+location.search
  });
}
function trackEcommerceEvent(name,params){
  if(!analyticsReady||typeof window.gtag!=='function')return;
  window.gtag('event',name,params);
}
function ecommerceItem(product,quantity=1,index=0){
  return {
    item_id:String(product.id),
    item_name:String(product.name||''),
    item_category:String(product.category||'Uncategorized'),
    price:Number(product.price)||0,
    quantity:Number(quantity)||1,
    index
  };
}
function cartEcommerceItems(items){
  return (items||[]).map((item,index)=>ecommerceItem({
    id:item.product_id,
    name:item.name,
    category:item.category,
    price:item.price
  },item.quantity,index));
}
function cartEcommerceValue(items){
  return (items||[]).reduce((sum,item)=>sum+(Number(item.price)||0)*(Number(item.quantity)||0),0);
}
async function loadGoogleAnalytics(){
  if(analyticsReady)return true;
  try{
    const response=await fetch('/api/public-config',{cache:'no-store'});
    if(!response.ok)return false;
    const config=await response.json();
    const measurementId=String(config.analyticsMeasurementId||'').trim();
    if(!/^G-[A-Z0-9]+$/i.test(measurementId))return false;

    window.dataLayer=window.dataLayer||[];
    window.gtag=function(){window.dataLayer.push(arguments);};
    window.gtag('consent','default',{
      ad_storage:'denied',
      ad_user_data:'denied',
      ad_personalization:'denied',
      analytics_storage:'denied',
      functionality_storage:'granted',
      security_storage:'granted'
    });
    window.gtag('consent','update',{
      analytics_storage:'granted',
      ad_storage:'denied',
      ad_user_data:'denied',
      ad_personalization:'denied'
    });
    window.gtag('js',new Date());
    window.gtag('config',measurementId,{send_page_view:false});

    await new Promise((resolve,reject)=>{
      const existing=document.querySelector('script[data-fligaliga-analytics]');
      if(existing){existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',reject,{once:true});return;}
      const tag=document.createElement('script');
      tag.async=true;
      tag.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(measurementId);
      tag.dataset.fligaligaAnalytics='true';
      tag.onload=resolve;
      tag.onerror=reject;
      document.head.appendChild(tag);
    });
    analyticsReady=true;
    trackAnalyticsPageView();
    return true;
  }catch(err){
    console.error('Analytics initialization failed:',err);
    analyticsReady=false;
    return false;
  }
}
function updateAnalyticsConsent(analytics){
  if(typeof window.gtag==='function'){
    window.gtag('consent','update',{
      analytics_storage:analytics?'granted':'denied',
      ad_storage:'denied',
      ad_user_data:'denied',
      ad_personalization:'denied'
    });
  }
  if(!analytics){
    analyticsReady=false;
    deleteAnalyticsCookies();
  }
}
async function saveAnalyticsConsent(analytics){
  storeConsent(analytics);
  if(analytics)await loadGoogleAnalytics();
  else updateAnalyticsConsent(false);
}
function openCookieSettings(){
  const panel=$('cookie-settings-panel');
  const toggle=$('cookie-analytics-toggle');
  const consent=readConsent();
  if(toggle)toggle.checked=consent?.analytics==='granted';
  panel?.classList.remove('hidden');
}
function closeCookieSettings(){
  $('cookie-settings-panel')?.classList.add('hidden');
}
function refreshCookieUi(){
  const notice=$('cookie-notice');
  const fab=$('cookie-settings-fab');
  const consent=readConsent();
  if(notice)notice.classList.toggle('hidden',!!consent);
  if(fab)fab.classList.add('hidden');
}
async function initCookieNotice(){
  if(!$('cookie-notice'))return;
  $('cookie-notice-accept')?.addEventListener('click',async()=>{
    await saveAnalyticsConsent(true);
    refreshCookieUi();
  });
  $('cookie-notice-reject')?.addEventListener('click',async()=>{
    await saveAnalyticsConsent(false);
    refreshCookieUi();
  });
  $('cookie-notice-settings')?.addEventListener('click',openCookieSettings);
  $('cookie-settings-fab')?.addEventListener('click',openCookieSettings);
  $('cookie-settings-close')?.addEventListener('click',closeCookieSettings);
  $('cookie-settings-save')?.addEventListener('click',async()=>{
    await saveAnalyticsConsent(!!$('cookie-analytics-toggle')?.checked);
    closeCookieSettings();
    refreshCookieUi();
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&!$('cookie-settings-panel')?.classList.contains('hidden'))closeCookieSettings();
  });
  refreshCookieUi();
  if(readConsent()?.analytics==='granted')await loadGoogleAnalytics();
}


document.addEventListener('DOMContentLoaded', async()=>{
  applyTheme();
  applyLanguage();
  initCookieNotice();
  document.documentElement.classList.add('fligaliga-ready');

  $('language-toggle')?.addEventListener('click',async()=>{
    const current=currentLanguage();
    localStorage.setItem('fligaliga-language',current==='en'?'nl':'en');
    applyLanguage();
    if(!$('admin-view')?.classList.contains('hidden')){
      await loadAdminProducts();
      await loadOrders();
    }else{
      route();
    }
  });

  $('theme-toggle')?.addEventListener('click',()=>{
    const current=localStorage.getItem('fligaliga-theme')||'light';
    localStorage.setItem('fligaliga-theme',current==='dark'?'light':'dark');
    applyTheme();
  });
await me();await loadProducts();await loadCart();if(state.isAdmin){await loadAdminProducts();await loadOrders();await loadAdminWithdrawals();}applySearchFromUrl();
  $('search-form').addEventListener('submit',e=>{e.preventDefault();const q=$('search-input').value.trim();navigate(q?`/?q=${encodeURIComponent(q)}#treasures`:'/');if(q)document.getElementById('treasures')?.scrollIntoView({behavior:'smooth'});});
  $('search-input').addEventListener('input',e=>{state.search=e.target.value;});
  document.querySelectorAll('[data-category]').forEach(b=>b.addEventListener('click',()=>{state.category=b.dataset.category;state.newOnly=false;state.catalogueExpanded=true;renderProducts();requestAnimationFrame(()=>{const bar=document.getElementById('category-bar');if(!bar)return;const target=bar.getBoundingClientRect().top+window.scrollY;window.scrollTo({top:Math.max(0,target),left:0,behavior:'smooth'});});}));
  $('clear-filter').addEventListener('click',()=>{state.category='all';state.search='';state.newOnly=false;state.catalogueExpanded=false;$('search-input').value='';history.replaceState({...history.state,fligaligaView:{category:'all',search:'',newOnly:false,catalogueExpanded:false,scrollY:0}},'', '/');renderProducts(true);});
  $('enter-vault-btn')?.addEventListener('click',()=>{state.category='all';state.search='';state.newOnly=false;state.catalogueExpanded=false;$('search-input').value='';history.replaceState({...history.state,fligaligaView:{category:'all',search:'',newOnly:false,catalogueExpanded:false,scrollY:window.scrollY}},'', '/');renderProducts(true);requestAnimationFrame(()=>{const bar=document.getElementById('category-bar');if(!bar)return;const target=bar.getBoundingClientRect().top+window.scrollY;window.scrollTo({top:Math.max(0,target),left:0,behavior:'smooth'});});});
  $('login-link').addEventListener('click',()=>show('auth-view'));$('logout-btn').addEventListener('click',logout);$('admin-link').addEventListener('click',async()=>{show('admin-view');await loadAdminProducts();await loadOrders();await loadAdminWithdrawals();});$('cart-btn').addEventListener('click',()=>state.user?show('cart-view'):show('auth-view'));
  $('login-form').addEventListener('submit',login);$('register-form').addEventListener('submit',register);$('empty-cart').addEventListener('click',emptyCart);$('checkout-btn').addEventListener('click',openCheckout);$('checkout-form').addEventListener('submit',checkout);$('cancel-checkout').addEventListener('click',()=>{$('checkout-panel').classList.add('hidden');$('checkout-message').textContent='';});$('admin-product-form').addEventListener('submit',adminAdd);$('admin-cancel-edit').addEventListener('click',resetAdminForm);
  if(location.pathname.startsWith('/product/'))await renderProductFromPath();else route();
  applyLanguage();
});
