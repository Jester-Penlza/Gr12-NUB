'use strict';

const SIZES = Object.freeze(['XS', 'S', 'M', 'L', 'XL', 'XXL']);
const MAX_QUANTITY = 30;
const DATA = window.UNIVUE_DATA;
const LIVE_DATABASE_MODE = Boolean(DATA?.isReady());
const STATIC_DEMO_MODE = document.documentElement.dataset.runtime === 'github-pages' && !LIVE_DATABASE_MODE;
const DEMO_INVENTORY_KEY = 'cutte_github_demo_inventory_v1';
const DEMO_SESSION_KEY = 'cutte_github_demo_admin';
const PENDING_PAYMENT_KEY = 'univue_pending_paymongo_payment';

const ITEMS = Object.freeze({
  MALE_POLO: { label: 'Male Polo', category: 'FORMAL', gender: 'MALE' },
  FEMALE_BLOUSE: { label: 'Female Blouse', category: 'FORMAL', gender: 'FEMALE' },
  MALE_PANTS: { label: 'Male Pants', category: 'FORMAL', gender: 'MALE' },
  FEMALE_SKIRT: { label: 'Female Skirt', category: 'FORMAL', gender: 'FEMALE' },
  T_SHIRT: { label: 'School T-Shirt (Unisex)', category: 'T_SHIRT', gender: null },
  PE_UNIFORM: { label: 'PE Uniform (Unisex)', category: 'PE_UNIFORM', gender: null }
});

// Replace only these image paths when the real product photographs are ready.
const PRODUCT_META = Object.freeze({
  MALE_POLO: {
    image: '/images/products/male-polo.png',
    price: 450,
    categoryLabel: 'Male formal uniform',
    description: 'Official male school polo. Select a size to request its current quantity from the live UNIVUE database.'
  },
  FEMALE_BLOUSE: {
    image: '/images/products/female-blouse.png',
    price: 450,
    categoryLabel: 'Female formal uniform',
    description: 'Official female school blouse. Select a size to request its current quantity from the live UNIVUE database.'
  },
  MALE_PANTS: {
    image: '/images/products/male-pants.png',
    price: 500,
    categoryLabel: 'Male formal uniform',
    description: 'Official male school pants. Stock is stored separately for every size from XS through XXL.'
  },
  FEMALE_SKIRT: {
    image: '/images/products/female-skirt.png',
    price: 480,
    categoryLabel: 'Female formal uniform',
    description: 'Official female school skirt. Stock is stored separately for every size from XS through XXL.'
  },
  T_SHIRT: {
    image: '/images/products/school-t-shirt.jpg',
    price: 250,
    categoryLabel: 'Unisex school wear',
    description: 'Official unisex school T-shirt. This item skips the gender question and goes directly to size selection.'
  },
  PE_UNIFORM: {
    image: '/images/products/pe-uniform.png',
    price: 550,
    categoryLabel: 'Unisex activity wear',
    description: 'Official unisex PE uniform. This item skips the gender question and goes directly to size selection.'
  }
});

const state = {
  category: null,
  gender: null,
  item: null,
  size: null,
  lastAction: null,
  assistanceSequence: null,
  adminCurrentKey: null,
  lastStockResult: null,
  lastOrderReference: null,
  assistanceRequest: null,
  stockVisible: true,
  cart: loadStoredCart()
};

const screens = [...document.querySelectorAll('[data-screen]')];
const byId = (id) => document.getElementById(id);
const currency = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });

function loadStoredCart() {
  try {
    const value = JSON.parse(localStorage.getItem('cutte_cart') || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((line) => ITEMS[line.item] && PRODUCT_META[line.item] && typeof line.size === 'string' && Number.isInteger(line.quantity) && line.quantity > 0 && line.quantity <= MAX_QUANTITY);
  } catch {
    return [];
  }
}

function saveCart() {
  try { localStorage.setItem('cutte_cart', JSON.stringify(state.cart)); } catch { /* kiosk can continue without persistence */ }
  updateCartBadge();
}

function cartKey(item, size) {
  return `${item}|${size}`;
}

function cartUnitCount() {
  return state.cart.reduce((total, line) => total + line.quantity, 0);
}

function cartTotal() {
  return state.cart.reduce((total, line) => total + PRODUCT_META[line.item].price * line.quantity, 0);
}

function updateCartBadge() {
  const count = cartUnitCount();
  byId('cart-count').textContent = count > 99 ? '99+' : String(count);
  byId('cart-count').setAttribute('aria-label', `${count} item${count === 1 ? '' : 's'} in cart`);
}

function showToast(message) {
  const toast = byId('cart-toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 2600);
}

function speak(message) {
  if (!('speechSynthesis' in window) || !message) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(message);
  utterance.lang = 'en-PH';
  utterance.rate = 0.95;
  window.speechSynthesis.speak(utterance);
}

function showScreen(name) {
  for (const screen of screens) screen.hidden = screen.dataset.screen !== name;
  const active = screens.find((screen) => screen.dataset.screen === name);
  active?.querySelector('h1, h2')?.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetStudent() {
  state.category = null;
  state.gender = null;
  state.item = null;
  state.size = null;
  state.lastAction = null;
  state.lastStockResult = null;
}

function goHome() {
  resetStudent();
  showScreen('home');
}

function browseProducts() {
  goHome();
  requestAnimationFrame(() => byId('products')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

function itemLabel(code) {
  return ITEMS[code]?.label ?? code;
}

function chooseCategory(category) {
  state.category = category;
  state.gender = null;
  state.item = category === 'T_SHIRT' || category === 'PE_UNIFORM' ? category : null;
  state.size = null;
  if (category === 'FORMAL') showScreen('gender');
  else showSize();
}

function chooseGender(gender) {
  state.gender = gender;
  state.item = null;
  const host = byId('garment-choices');
  host.replaceChildren();
  for (const [code, item] of Object.entries(ITEMS)) {
    if (item.gender !== gender) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice';
    button.dataset.item = code;
    const image = document.createElement('img');
    image.src = PRODUCT_META[code].image;
    image.alt = `${item.label} product photograph`;
    const copy = document.createElement('span');
    const category = document.createElement('small');
    category.textContent = PRODUCT_META[code].categoryLabel;
    const strong = document.createElement('strong');
    strong.textContent = item.label;
    const description = document.createElement('em');
    description.textContent = 'View sizes and live stock';
    const arrow = document.createElement('b');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '→';
    copy.append(category, strong, description);
    button.append(image, copy, arrow);
    host.append(button);
  }
  showScreen('garment');
}

function statusDisplay(status) {
  return {
    AVAILABLE: { label: 'Available', range: '4–30 units' },
    LOW_STOCK: { label: 'Low Stock', range: '1–3 units' },
    OUT_OF_STOCK: { label: 'Out of Stock', range: '0 units' }
  }[status];
}

function updateStockVisibility() {
  const visible = state.stockVisible;
  const toggle = byId('stock-visibility-toggle');
  toggle.textContent = visible ? 'Hide stock' : 'Show stock';
  toggle.setAttribute('aria-expanded', String(visible));

  const grid = byId('size-stock-grid');
  grid.classList.toggle('stock-values-hidden', !visible);
  grid.setAttribute('aria-label', visible ? 'Current stock by size' : 'Size selection with stock quantities hidden');
  for (const card of grid.querySelectorAll('.size-stock-card')) {
    const quantity = card.querySelector('.stock-value');
    const status = card.querySelector('.stock-status');
    if (quantity) quantity.hidden = !visible;
    if (status) status.textContent = visible ? card.dataset.stockLabel : 'Select size';
    card.setAttribute('aria-label', visible
      ? card.dataset.visibleLabel
      : `Size ${card.dataset.size}. Stock quantity is hidden. Select to perform a live hardware check.`);
  }

  byId('result-stock-quantity').hidden = !visible;
}

function toggleStockVisibility() {
  state.stockVisible = !state.stockVisible;
  updateStockVisibility();
}

function renderSizeStockCards(sizes, item) {
  const host = byId('size-stock-grid');
  host.replaceChildren();
  for (const size of SIZES) {
    const result = sizes.find((entry) => entry.size === size);
    const display = result && statusDisplay(result.status);
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.size = size;
    button.className = 'size-stock-card';
    button.dataset.stockLabel = result ? display.label : 'Not loaded';
    button.dataset.visibleLabel = result
      ? `Size ${size}: ${display.label}, ${result.quantity} of ${MAX_QUANTITY} units. Select to activate a live hardware check.`
      : `Size ${size}: stock unavailable. Select to retry a live hardware check.`;
    const sizeLabel = document.createElement('strong');
    sizeLabel.textContent = size;
    const quantity = document.createElement('span');
    quantity.className = 'stock-value';
    quantity.textContent = result ? `${result.quantity} / ${MAX_QUANTITY}` : 'Check live';
    const status = document.createElement('small');
    status.className = 'stock-status';
    status.textContent = result ? display.label : 'Not loaded';
    button.append(sizeLabel, quantity, status);
    host.append(button);
  }
  byId('size-stock-message').textContent = item === state.item
    ? 'Select a size, then confirm to activate the matching hardware status light.'
    : '';
  updateStockVisibility();
}

async function loadSizeStockOverview(item) {
  renderSizeStockCards([], item);
  byId('size-stock-message').textContent = 'Reading all six size quantities from UNIVUE…';
  try {
    const result = LIVE_DATABASE_MODE
      ? { item, maxQuantity: MAX_QUANTITY, sizes: await DATA.inventoryOverview(item) }
      : await requestJson(`/inventory?item=${encodeURIComponent(item)}`, {}, 14000);
    if (state.item !== item) return;
    if (result.item !== item || result.maxQuantity !== MAX_QUANTITY || !Array.isArray(result.sizes) || result.sizes.length !== SIZES.length) {
      throw new Error('BAD_RESPONSE');
    }
    for (const entry of result.sizes) {
      if (!SIZES.includes(entry.size) || !Number.isInteger(entry.quantity) || entry.quantity < 0 || entry.quantity > MAX_QUANTITY || !statusDisplay(entry.status)) {
        throw new Error('BAD_RESPONSE');
      }
    }
    renderSizeStockCards(result.sizes, item);
  } catch (error) {
    if (state.item !== item) return;
    renderSizeStockCards([], item);
    byId('size-stock-message').textContent = `${friendlyError(error)} You can still select a size and retry its live check.`;
  }
}

function showSize() {
  const meta = PRODUCT_META[state.item];
  state.lastStockResult = null;
  byId('size-item').textContent = itemLabel(state.item);
  byId('size-step').textContent = state.category === 'FORMAL' ? 'Step 4 of 5' : 'Step 2 of 4';
  byId('detail-category').textContent = meta.categoryLabel;
  byId('detail-description').textContent = meta.description;
  byId('detail-price').textContent = `${currency.format(meta.price)} · current catalog price`;
  byId('detail-image').src = meta.image;
  byId('detail-image').alt = `${itemLabel(state.item)} product photograph`;
  byId('detail-image-label').textContent = 'Bulldogs Exchange';
  showScreen('size');
  void loadSizeStockOverview(state.item);
}

function openProduct(code) {
  const item = ITEMS[code];
  if (!item) return;
  state.category = item.category;
  state.gender = item.gender;
  state.item = code;
  state.size = null;
  showSize();
}

function chooseSize(size) {
  state.size = size;
  byId('confirm-item').textContent = itemLabel(state.item);
  byId('confirm-size').textContent = `Size ${size}`;
  byId('confirm-image').src = PRODUCT_META[state.item].image;
  byId('confirm-image').alt = `${itemLabel(state.item)} product photograph`;
  showScreen('confirm');
}

function stockStatus(quantity) {
  if (quantity === 0) return 'OUT_OF_STOCK';
  if (quantity <= 3) return 'LOW_STOCK';
  return 'AVAILABLE';
}

function defaultDemoInventory() {
  return Object.fromEntries(Object.keys(ITEMS).flatMap((item) => SIZES.map((size) => [`${item}|${size}`, 10])));
}

function loadDemoInventory() {
  const fallback = defaultDemoInventory();
  try {
    const stored = JSON.parse(localStorage.getItem(DEMO_INVENTORY_KEY) || 'null');
    if (!stored || typeof stored !== 'object') return fallback;
    for (const key of Object.keys(fallback)) {
      if (!Number.isInteger(stored[key]) || stored[key] < 0 || stored[key] > MAX_QUANTITY) return fallback;
    }
    return stored;
  } catch {
    return fallback;
  }
}

function demoError(code, status = 400) {
  const error = new Error(code);
  error.status = status;
  return error;
}

function requireDemoItemAndSize(item, size) {
  if (!ITEMS[item]) throw demoError('UNKNOWN_ITEM');
  if (!SIZES.includes(size)) throw demoError('UNKNOWN_SIZE');
}

async function requestDemoJson(url, options = {}) {
  const requestUrl = new URL(url, window.location.href);
  const method = String(options.method || 'GET').toUpperCase();
  const item = requestUrl.searchParams.get('item');
  const size = requestUrl.searchParams.get('size');
  const inventory = loadDemoInventory();

  if (method === 'GET' && requestUrl.pathname.endsWith('/status')) {
    return { controller: 'GITHUB DEMO', assistanceSequence: 0, assistanceRequestedAt: null, authenticated: sessionStorage.getItem(DEMO_SESSION_KEY) === 'true' };
  }
  if (method === 'GET' && requestUrl.pathname.endsWith('/inventory')) {
    if (!ITEMS[item]) throw demoError('UNKNOWN_ITEM');
    return { item, maxQuantity: MAX_QUANTITY, sizes: SIZES.map((entrySize) => {
      const quantity = inventory[`${item}|${entrySize}`];
      return { size: entrySize, quantity, status: stockStatus(quantity) };
    }) };
  }
  if (method === 'GET' && requestUrl.pathname.endsWith('/check')) {
    requireDemoItemAndSize(item, size);
    const quantity = inventory[`${item}|${size}`];
    return { item, size, quantity, status: stockStatus(quantity) };
  }

  let body = {};
  try { body = options.body ? JSON.parse(options.body) : {}; } catch { throw demoError('BAD_JSON'); }
  if (method === 'POST' && requestUrl.pathname.endsWith('/login')) {
    if (String(body.pin ?? '') !== '2468') throw demoError('INVALID_PIN', 401);
    sessionStorage.setItem(DEMO_SESSION_KEY, 'true');
    return { authenticated: true };
  }
  if (method === 'POST' && requestUrl.pathname.endsWith('/logout')) {
    sessionStorage.removeItem(DEMO_SESSION_KEY);
    return { authenticated: false };
  }
  if (method === 'POST' && requestUrl.pathname.endsWith('/update')) {
    if (sessionStorage.getItem(DEMO_SESSION_KEY) !== 'true') throw demoError('UNAUTHORIZED', 401);
    requireDemoItemAndSize(body.item, body.size);
    if (!Number.isInteger(body.quantity) || body.quantity < 0 || body.quantity > MAX_QUANTITY) throw demoError('BAD_QUANTITY');
    inventory[`${body.item}|${body.size}`] = body.quantity;
    localStorage.setItem(DEMO_INVENTORY_KEY, JSON.stringify(inventory));
    return { item: body.item, size: body.size, quantity: body.quantity, status: stockStatus(body.quantity), confirmed: true };
  }
  throw demoError('NOT_FOUND', 404);
}

async function requestJson(url, options = {}, timeoutMs = 5000) {
  if (STATIC_DEMO_MODE) return requestDemoJson(url, options);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || `HTTP_${response.status}`);
      error.status = response.status;
      throw error;
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function friendlyError(error) {
  if (error.name === 'AbortError' || error.message === 'TIMEOUT') return 'The stock service did not respond before the timeout.';
  if (error.message === 'UNKNOWN_ITEM') return 'The selected item was not recognized by the controller.';
  if (error.message === 'UNKNOWN_SIZE') return 'The selected size was not recognized by the controller.';
  if (error.message === 'BAD_QUANTITY') return `Enter a whole number from 0 to ${MAX_QUANTITY}.`;
  if (error.message === 'UNAUTHORIZED' || error.status === 401) return 'Your administrator session expired. Log in again.';
  if (error.message === 'SUPABASE_UNAVAILABLE') return 'The UNIVUE database connection is unavailable.';
  if (error.message === 'STOCK_NOT_FOUND') return 'No inventory record exists for that item and size.';
  if (error.message === 'PAYMENT_SESSION_EXPIRED') return 'This secure payment session is no longer available. Ask staff to help with the reserved order.';
  if (error.message === 'INVALID_PAYMENT_QR') return 'PayMongo did not return a valid test QR. Your order remains reserved; generate it again.';
  if (error.message.includes('PAYMENT') || error.message.includes('CHECKOUT')) return 'The secure QR payment page is temporarily unavailable. Your order remains reserved; retry when ready.';
  if (error.message.includes('INSUFFICIENT_STOCK')) return 'One or more items no longer have enough stock for this order.';
  if (error.message.includes('UNKNOWN_KIOSK')) return 'This kiosk is not registered in UNIVUE.';
  return 'UNIVUE received an invalid response or could not reach the live stock database.';
}

async function checkStock() {
  if (!ITEMS[state.item] || !state.size) return;
  state.lastAction = checkStock;
  showScreen('loading');
  try {
    const result = LIVE_DATABASE_MODE
      ? await DATA.checkInventory(state.item, state.size)
      : await requestJson(`/check?item=${encodeURIComponent(state.item)}&size=${encodeURIComponent(state.size)}`);
    if (result.item !== state.item || result.size !== state.size || !Number.isInteger(result.quantity)) {
      throw new Error('BAD_RESPONSE');
    }
    state.lastStockResult = result;
    signalPhysicalIndicator(result);
    renderResult(result);
  } catch (error) {
    byId('error-message').textContent = friendlyError(error);
    showScreen('error');
  }
}

function signalPhysicalIndicator(result) {
  if (!['localhost', '127.0.0.1'].includes(window.location.hostname)) return;
  const baseUrl = DATA?.config?.hardwareBaseUrl || '';
  fetch(`${baseUrl}/hardware/indicator`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item: result.item, size: result.size, quantity: result.quantity, status: result.status })
  }).catch(() => { /* the database result remains valid if optional GPIO output is unavailable */ });
}

function renderResult(result) {
  const display = statusDisplay(result.status);
  if (!display) throw new Error('BAD_RESPONSE');
  const hardwareGuidance = {
    AVAILABLE: 'Stock is available for this size. The Raspberry Pi can show the matching physical LED status.',
    LOW_STOCK: 'Only 1–3 units remain. The Raspberry Pi can show the matching physical LED so staff can act early.',
    OUT_OF_STOCK: 'No units remain for this size. The Raspberry Pi can show the out-of-stock physical LED.'
  }[result.status];
  const demoGuidance = {
    AVAILABLE: 'Stock is available for this size in the online demonstration.',
    LOW_STOCK: 'Only 1–3 demonstration units remain for this size.',
    OUT_OF_STOCK: 'No demonstration units remain for this size.'
  }[result.status];
  byId('result-status').textContent = display.label;
  byId('result-badge').textContent = display.label.toUpperCase();
  byId('result-badge').className = 'status-badge';
  byId('result-quantity').textContent = result.quantity;
  byId('result-item').textContent = `${itemLabel(result.item)} • Size ${result.size}`;
  byId('result-guidance').textContent = STATIC_DEMO_MODE ? demoGuidance : hardwareGuidance;
  byId('result-image').src = PRODUCT_META[result.item].image;
  byId('result-image').alt = `${itemLabel(result.item)} product photograph`;
  updateStockVisibility();
  const addButton = byId('add-to-cart');
  addButton.disabled = result.quantity < 1;
  addButton.textContent = result.quantity < 1 ? 'Out of stock' : `Add to cart · ${currency.format(PRODUCT_META[result.item].price)}`;
  showScreen('result');
  speak(`${itemLabel(result.item)}, size ${result.size}. ${display.label}. ${result.quantity} units available.`);
}

function addCurrentToCart() {
  const result = state.lastStockResult;
  if (!result || result.item !== state.item || result.size !== state.size || result.quantity < 1) return;
  const key = cartKey(result.item, result.size);
  const existing = state.cart.find((line) => cartKey(line.item, line.size) === key);
  if (existing) existing.quantity = Math.min(existing.quantity + 1, result.quantity);
  else state.cart.push({ item: result.item, size: result.size, quantity: 1 });
  saveCart();
  showToast(`${itemLabel(result.item)} · ${result.size} added to cart`);
  renderCart();
  showScreen('cart');
}

function cartLineMarkup(line) {
  const meta = PRODUCT_META[line.item];
  const key = cartKey(line.item, line.size);
  return `<article class="cart-line" data-cart-key="${key}">
    <img src="${meta.image}" alt="${itemLabel(line.item)} product photograph">
    <div class="cart-line-copy"><p>${meta.categoryLabel}</p><h3>${itemLabel(line.item)}</h3><span>Size ${line.size} · ${currency.format(meta.price)} each</span><button type="button" data-cart-remove="${key}">Remove</button></div>
    <div class="quantity-control" aria-label="Quantity for ${itemLabel(line.item)} size ${line.size}"><button type="button" data-cart-change="${key}" data-delta="-1" aria-label="Decrease quantity">−</button><strong>${line.quantity}</strong><button type="button" data-cart-change="${key}" data-delta="1" aria-label="Increase quantity">+</button></div>
    <strong class="line-total">${currency.format(meta.price * line.quantity)}</strong>
  </article>`;
}

function renderCart() {
  const host = byId('cart-items');
  host.innerHTML = state.cart.map(cartLineMarkup).join('');
  const empty = state.cart.length === 0;
  byId('cart-empty').hidden = !empty;
  byId('cart-units').textContent = String(cartUnitCount());
  byId('cart-total').textContent = currency.format(cartTotal());
  byId('checkout-button').disabled = empty;
  updateCartBadge();
}

function openCart() {
  renderCart();
  showScreen('cart');
}

function changeCartQuantity(key, delta) {
  const line = state.cart.find((entry) => cartKey(entry.item, entry.size) === key);
  if (!line) return;
  line.quantity = Math.max(1, Math.min(MAX_QUANTITY, line.quantity + delta));
  saveCart();
  renderCart();
}

function removeCartLine(key) {
  state.cart = state.cart.filter((line) => cartKey(line.item, line.size) !== key);
  saveCart();
  renderCart();
}

function renderCheckoutSummary() {
  byId('checkout-items').innerHTML = state.cart.map((line) => {
    const meta = PRODUCT_META[line.item];
    return `<div class="checkout-line"><img src="${meta.image}" alt=""><span><b>${itemLabel(line.item)}</b><small>Size ${line.size} · Qty ${line.quantity}</small></span><strong>${currency.format(meta.price * line.quantity)}</strong></div>`;
  }).join('');
  const total = currency.format(cartTotal());
  byId('checkout-subtotal').textContent = total;
  byId('checkout-total').textContent = total;
}

function beginCheckout() {
  if (!state.cart.length) return openCart();
  renderCheckoutSummary();
  byId('checkout-message').textContent = '';
  showScreen('checkout');
}

function saveOrder(order) {
  try {
    const orders = JSON.parse(localStorage.getItem('cutte_orders') || '[]');
    const safeOrders = Array.isArray(orders) ? orders : [];
    const storedOrder = { ...order };
    delete storedOrder.accessToken;
    safeOrders.unshift(storedOrder);
    localStorage.setItem('cutte_orders', JSON.stringify(safeOrders.slice(0, 20)));
  } catch { /* the visible receipt still remains available */ }
}

function renderOrderConfirmation(order, paymentMessage) {
  clearInterval(renderPaymongoQr.expiryTimer);
  byId('paymongo-qr-card').hidden = true;
  byId('paymongo-qr-code').replaceChildren();
  state.lastOrderReference = order.reference;
  byId('order-reference').textContent = order.reference;
  byId('order-payment').textContent = paymentMessage || (order.paymentMethod === 'CASH'
    ? 'Cash · awaiting staff confirmation'
    : 'QR Ph / GCash · awaiting verified PayMongo confirmation');
  byId('order-fulfillment').textContent = order.fulfillment === 'CAMPUS_DELIVERY'
    ? 'Campus delivery requested'
    : 'Pickup at the merchandise office';
  byId('order-success-items').innerHTML = (order.items || []).map((line) => `<div><span>${itemLabel(line.item)} · ${line.size} × ${line.quantity}</span><strong>${currency.format(line.unitPrice * line.quantity)}</strong></div>`).join('') + `<div class="receipt-total"><span>Total due</span><strong>${currency.format(order.total)}</strong></div>`;
  byId('retry-online-payment').hidden = order.paymentMethod !== 'GCASH';
  showScreen('order-success');
}

function renderPaymongoQr(order, checkout) {
  const qrImageUrl = checkout?.qrImageUrl || '';
  const expiresAt = Date.parse(checkout?.expiresAt || '');
  if (
    checkout?.testMode !== true ||
    !/^data:image\/(?:png|svg\+xml);base64,/i.test(qrImageUrl) ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now()
  ) {
    throw new Error('INVALID_PAYMENT_QR');
  }

  const host = byId('paymongo-qr-code');
  host.replaceChildren();
  const image = new Image();
  image.src = qrImageUrl;
  image.alt = `PayMongo test QR for order ${order.reference}`;
  image.width = 240;
  image.height = 240;
  host.append(image);
  byId('paymongo-qr-total').textContent = currency.format(order.total);
  const openQr = byId('paymongo-qr-open');
  openQr.href = qrImageUrl;
  openQr.removeAttribute('aria-disabled');
  byId('paymongo-qr-card').hidden = false;
  byId('retry-online-payment').hidden = true;
  byId('order-payment').textContent = 'PayMongo QR Ph test image generated · simulation only';

  const expiry = byId('paymongo-qr-expires');
  clearInterval(renderPaymongoQr.expiryTimer);
  const updateExpiry = () => {
    const seconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
    if (seconds === 0) {
      expiry.textContent = 'This test QR has expired. Generate a new one to continue the simulation.';
      openQr.removeAttribute('href');
      openQr.setAttribute('aria-disabled', 'true');
      byId('retry-online-payment').hidden = false;
      byId('retry-online-payment').disabled = false;
      byId('retry-online-payment').textContent = 'Generate a new test QR';
      clearInterval(renderPaymongoQr.expiryTimer);
      return;
    }
    const minutes = Math.floor(seconds / 60);
    const remainder = String(seconds % 60).padStart(2, '0');
    expiry.textContent = `Expires in ${minutes}:${remainder}`;
  };
  updateExpiry();
  renderPaymongoQr.expiryTimer = setInterval(updateExpiry, 1000);
}

function storePendingPayment(order) {
  sessionStorage.setItem(PENDING_PAYMENT_KEY, JSON.stringify({
    orderReference: order.reference,
    accessToken: order.accessToken
  }));
}

async function retryOnlinePayment() {
  const button = byId('retry-online-payment');
  button.disabled = true;
  button.textContent = 'Generating secure test QR…';
  try {
    const pending = JSON.parse(sessionStorage.getItem(PENDING_PAYMENT_KEY) || 'null');
    if (!pending?.orderReference || !pending?.accessToken) throw new Error('PAYMENT_SESSION_EXPIRED');
    const checkout = await DATA.createPaymongoCheckout(pending.orderReference, pending.accessToken);
    const orders = JSON.parse(localStorage.getItem('cutte_orders') || '[]');
    const order = Array.isArray(orders) ? orders.find((entry) => entry.reference === pending.orderReference) : null;
    if (!order) throw new Error('PAYMENT_SESSION_EXPIRED');
    renderOrderConfirmation(order);
    renderPaymongoQr(order, checkout);
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Retry secure QR payment';
    showToast(friendlyError(error));
  }
}

async function placeOrder(event) {
  event.preventDefault();
  if (!state.cart.length) return openCart();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  const submit = byId('place-order');
  const message = byId('checkout-message');
  submit.disabled = true;
  message.textContent = 'Rechecking stock and creating the UNIVUE order…';
  try {
    if (!LIVE_DATABASE_MODE) {
      for (const line of state.cart) {
        const result = await requestJson(`/check?item=${encodeURIComponent(line.item)}&size=${encodeURIComponent(line.size)}`);
        if (!Number.isInteger(result.quantity) || result.quantity < line.quantity) {
          throw new Error(`INSUFFICIENT_STOCK:${line.item}:${line.size}:${result.quantity ?? 0}`);
        }
      }
    }
    const order = {
      reference: `UNIVUE-${new Date().toISOString().slice(2, 10).replaceAll('-', '')}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      customerName: String(form.get('customerName') || '').trim(),
      studentId: String(form.get('studentId') || '').trim(),
      collegeDepartment: String(form.get('collegeDepartment') || '').trim(),
      contactNumber: String(form.get('contactNumber') || '').trim(),
      fulfillment: String(form.get('fulfillment') || 'PICKUP'),
      notes: String(form.get('notes') || '').trim(),
      paymentMethod: String(form.get('paymentMethod') || 'CASH'),
      items: state.cart.map((line) => ({ ...line, unitPrice: PRODUCT_META[line.item].price })),
      total: cartTotal(),
      createdAt: new Date().toISOString(),
      status: 'AWAITING_COUNTER_PAYMENT'
    };
    if (LIVE_DATABASE_MODE) {
      const created = await DATA.placeOrder(order);
      order.id = created.id;
      order.reference = created.reference;
      order.accessToken = created.accessToken;
      order.total = Number(created.total);
      order.status = created.status;
    }
    saveOrder(order);
    state.cart = [];
    saveCart();
    formElement.reset();
    if (LIVE_DATABASE_MODE && order.paymentMethod === 'GCASH') {
      storePendingPayment(order);
      message.textContent = 'Order reserved. Generating the PayMongo test QR…';
      try {
        const checkout = await DATA.createPaymongoCheckout(order.reference, order.accessToken);
        renderOrderConfirmation(order);
        renderPaymongoQr(order, checkout);
        return;
      } catch (paymentError) {
        renderOrderConfirmation(order, 'PayMongo test QR unavailable · order remains safely reserved');
        showToast(friendlyError(paymentError));
        return;
      }
    }
    renderOrderConfirmation(order);
  } catch (error) {
    if (error.message.startsWith('INSUFFICIENT_STOCK:') && error.message.split(':').length >= 4) {
      const [, item, size, available] = error.message.split(':');
      message.textContent = `${itemLabel(item)} · ${size} now has only ${available} available. Update the cart before placing the order.`;
    } else {
      message.textContent = friendlyError(error);
    }
  } finally {
    submit.disabled = false;
  }
}

async function openAdmin() {
  if (LIVE_DATABASE_MODE) {
    window.location.href = './staff.html';
    return;
  }
  try {
    const status = await requestJson('/status');
    showScreen(status.authenticated ? 'admin-inventory' : 'admin-login');
  } catch {
    showScreen('admin-login');
  }
}

async function requestAssistance() {
  const button = document.querySelector('[data-action="request-assistance"]');
  const banner = byId('assist-banner');
  button.disabled = true;
  banner.hidden = false;
  byId('assist-title').textContent = 'Contacting staff…';
  byId('assist-message').textContent = 'Please remain near the kiosk.';
  try {
    if (LIVE_DATABASE_MODE) {
      state.assistanceRequest = await DATA.requestAssistance({
        item: state.item,
        size: state.size,
        orderReference: state.lastOrderReference
      });
      byId('assist-title').textContent = 'Assistance requested.';
      byId('assist-message').textContent = 'The UNIVUE staff dashboard has been notified.';
      speak('Assistance requested. A staff member has been notified.');
    } else {
      await postJson('/simulate/assist', {});
      byId('assist-title').textContent = 'Assistance requested.';
      byId('assist-message').textContent = 'The local kiosk controller has recorded the request.';
    }
  } catch (error) {
    byId('assist-title').textContent = 'Could not notify staff.';
    byId('assist-message').textContent = friendlyError(error);
  } finally {
    button.disabled = false;
  }
}

async function refreshAssistanceStatus() {
  if (!LIVE_DATABASE_MODE || !state.assistanceRequest) return;
  try {
    const current = await DATA.assistanceStatus(state.assistanceRequest.id, state.assistanceRequest.accessToken);
    if (!current) return;
    const changed = current.status !== state.assistanceRequest.status;
    state.assistanceRequest.status = current.status;
    if (current.status === 'ACKNOWLEDGED') {
      byId('assist-title').textContent = 'Staff acknowledged your request.';
      byId('assist-message').textContent = 'A staff member is on the way.';
      if (changed) speak('A staff member acknowledged your request and is on the way.');
    } else if (current.status === 'RESOLVED') {
      byId('assist-title').textContent = 'Assistance completed.';
      byId('assist-message').textContent = 'Thank you. You may continue using UNIVUE.';
      state.assistanceRequest = null;
      clearTimeout(refreshAssistanceStatus.hideTimer);
      refreshAssistanceStatus.hideTimer = setTimeout(() => { byId('assist-banner').hidden = true; }, 6000);
    }
  } catch { /* the next status poll can recover */ }
}

function postJson(url, body) {
  return requestJson(url, { method: 'POST', body: JSON.stringify(body) });
}

async function login(event) {
  event.preventDefault();
  const errorHost = byId('login-error');
  errorHost.hidden = true;
  try {
    await postJson('/login', { pin: byId('admin-pin').value });
    event.currentTarget.reset();
    showScreen('admin-inventory');
  } catch (error) {
    errorHost.textContent = error.message === 'INVALID_PIN' ? 'Incorrect prototype PIN.' : friendlyError(error);
    errorHost.hidden = false;
  }
}

function adminSelection() {
  return {
    item: byId('admin-item').value,
    size: byId('admin-size').value
  };
}

function resetAdminCurrent() {
  state.adminCurrentKey = null;
  byId('admin-current').textContent = 'Not read';
  byId('admin-quantity').value = '';
  byId('admin-quantity').disabled = true;
  byId('save-quantity').disabled = true;
  byId('admin-message').textContent = '';
}

function populateAdminItems() {
  const category = byId('admin-category').value;
  const gender = byId('admin-gender').value;
  const select = byId('admin-item');
  const genderWrap = byId('admin-gender-wrap');
  genderWrap.hidden = category !== 'FORMAL';
  select.replaceChildren(new Option('Choose item', ''));
  for (const [code, item] of Object.entries(ITEMS)) {
    const matches = category === 'FORMAL'
      ? item.category === 'FORMAL' && Boolean(gender) && item.gender === gender
      : item.category === category;
    if (matches) select.add(new Option(item.label, code));
  }
  select.disabled = select.options.length === 1;
  resetAdminCurrent();
}

async function readCurrent() {
  const selection = adminSelection();
  const message = byId('admin-message');
  if (!selection.item || !selection.size) {
    message.textContent = 'Choose an item and size first.';
    return;
  }
  message.textContent = 'Reading from controller…';
  try {
    const result = await requestJson(`/check?item=${encodeURIComponent(selection.item)}&size=${encodeURIComponent(selection.size)}`);
    byId('admin-current').textContent = `${result.quantity} • ${result.status.replaceAll('_', ' ')}`;
    byId('admin-quantity').disabled = false;
    byId('save-quantity').disabled = false;
    state.adminCurrentKey = `${selection.item}|${selection.size}`;
    message.textContent = 'Current quantity verified. Enter the physically counted replacement quantity.';
  } catch (error) {
    resetAdminCurrent();
    message.textContent = friendlyError(error);
  }
}

async function saveQuantity(event) {
  event.preventDefault();
  const selection = adminSelection();
  const message = byId('admin-message');
  const key = `${selection.item}|${selection.size}`;
  const raw = byId('admin-quantity').value;
  if (key !== state.adminCurrentKey) {
    message.textContent = 'Read the current quantity for this exact item and size before saving.';
    return;
  }
  if (!/^\d+$/.test(raw) || Number(raw) > MAX_QUANTITY) {
    message.textContent = `Enter a whole number from 0 to ${MAX_QUANTITY}.`;
    return;
  }
  byId('save-quantity').disabled = true;
  message.textContent = 'Waiting for Arduino confirmation…';
  try {
    const result = await postJson('/update', { ...selection, quantity: Number(raw) });
    if (!result.confirmed) throw new Error('BAD_RESPONSE');
    byId('admin-current').textContent = `${result.quantity} • ${result.status.replaceAll('_', ' ')}`;
    message.textContent = 'Saved and confirmed by the controller.';
  } catch (error) {
    message.textContent = friendlyError(error);
    if (error.status === 401) showScreen('admin-login');
  } finally {
    byId('save-quantity').disabled = false;
  }
}

async function logout() {
  try { await postJson('/logout', {}); } catch { /* local logout still returns to login */ }
  resetAdminCurrent();
  showScreen('admin-login');
}

async function pollStatus() {
  if (LIVE_DATABASE_MODE) {
    byId('controller-state').textContent = `UNIVUE database: live · ${DATA.config.kioskCode}`;
    await refreshAssistanceStatus();
    return;
  }
  try {
    const status = await requestJson('/status', {}, 2500);
    byId('controller-state').textContent = `Controller status: ${status.controller}`;
    const sequence = Number(status.assistanceSequence ?? 0);
    if (state.assistanceSequence !== null && sequence > state.assistanceSequence) {
      const banner = byId('assist-banner');
      banner.hidden = false;
      clearTimeout(pollStatus.bannerTimer);
      pollStatus.bannerTimer = setTimeout(() => { banner.hidden = true; }, 8000);
    }
    state.assistanceSequence = sequence;
  } catch {
    byId('controller-state').textContent = 'Controller status: unavailable';
  }
}

document.addEventListener('click', (event) => {
  const cartChange = event.target.closest('[data-cart-change]');
  if (cartChange) {
    changeCartQuantity(cartChange.dataset.cartChange, Number(cartChange.dataset.delta));
    return;
  }
  const cartRemove = event.target.closest('[data-cart-remove]');
  if (cartRemove) {
    removeCartLine(cartRemove.dataset.cartRemove);
    return;
  }
  const productButton = event.target.closest('[data-product]');
  if (productButton) openProduct(productButton.dataset.product);
  const categoryButton = event.target.closest('[data-category]');
  if (categoryButton) chooseCategory(categoryButton.dataset.category);
  const genderButton = event.target.closest('[data-gender]');
  if (genderButton) chooseGender(genderButton.dataset.gender);
  const garmentButton = event.target.closest('[data-item]');
  if (garmentButton) { state.item = garmentButton.dataset.item; showSize(); }
  const sizeButton = event.target.closest('[data-size]');
  if (sizeButton) chooseSize(sizeButton.dataset.size);

  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  const actions = {
    home: goHome,
    'browse-products': browseProducts,
    'open-cart': openCart,
    checkout: beginCheckout,
    'add-to-cart': addCurrentToCart,
    'start-check': () => { resetStudent(); showScreen('category'); },
    'open-admin': openAdmin,
    'request-assistance': requestAssistance,
    'back-category': () => showScreen('category'),
    'back-gender': () => showScreen('gender'),
    'back-from-size': () => showScreen(state.category === 'FORMAL' ? 'garment' : 'category'),
    'edit-size': showSize,
    'toggle-stock': toggleStockVisibility,
    'confirm-check': checkStock,
    'check-another': () => { resetStudent(); showScreen('category'); },
    retry: () => state.lastAction?.(),
    'retry-online-payment': retryOnlinePayment,
    'read-current': readCurrent,
    logout
  };
  actions[action]?.();
});

byId('login-form').addEventListener('submit', login);
byId('inventory-form').addEventListener('submit', saveQuantity);
byId('checkout-form').addEventListener('submit', placeOrder);
byId('product-search').addEventListener('input', (event) => {
  const query = event.currentTarget.value.trim().toLowerCase();
  let visible = 0;
  for (const card of document.querySelectorAll('[data-product-card]')) {
    const matches = !query || card.dataset.search.includes(query);
    card.hidden = !matches;
    if (matches) visible += 1;
  }
  byId('product-search-status').textContent = query
    ? `${visible} product${visible === 1 ? '' : 's'} found`
    : 'Showing all 6 products';
});
byId('checkout-form').addEventListener('change', (event) => {
  if (event.target.name !== 'paymentMethod') return;
  const isGcash = event.target.value === 'GCASH';
  const panel = byId('gcash-qr-panel');
  panel.hidden = !isGcash;
  byId('place-order').textContent = isGcash ? 'Continue to secure QR payment' : 'Place order';
});
byId('admin-category').addEventListener('change', () => {
  byId('admin-gender').value = '';
  populateAdminItems();
});
byId('admin-gender').addEventListener('change', populateAdminItems);
byId('admin-item').addEventListener('change', resetAdminCurrent);
byId('admin-size').addEventListener('change', resetAdminCurrent);

if (!LIVE_DATABASE_MODE) byId('deployment-note').hidden = false;
renderCart();
const paymentReturn = new URLSearchParams(window.location.search);
if (paymentReturn.has('payment') && paymentReturn.get('order')) {
  const reference = paymentReturn.get('order');
  let savedOrder = null;
  try {
    const orders = JSON.parse(localStorage.getItem('cutte_orders') || '[]');
    savedOrder = Array.isArray(orders) ? orders.find((order) => order.reference === reference) : null;
  } catch { /* show a minimal confirmation below */ }
  const returnedOrder = savedOrder || { reference, paymentMethod: 'GCASH', fulfillment: 'PICKUP', items: [], total: 0 };
  const cancelled = paymentReturn.get('payment') === 'cancelled';
  renderOrderConfirmation(returnedOrder, cancelled
    ? 'QR payment cancelled · your reserved order is still awaiting payment'
    : 'Payment submitted · waiting for secure PayMongo verification');
  if (!cancelled) {
    sessionStorage.removeItem(PENDING_PAYMENT_KEY);
    byId('retry-online-payment').hidden = true;
  }
  window.history.replaceState({}, document.title, window.location.pathname);
}
pollStatus();
setInterval(pollStatus, 2000);
