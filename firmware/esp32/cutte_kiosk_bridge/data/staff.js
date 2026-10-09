'use strict';

const DATA = window.UNIVUE_DATA;
const byId = (id) => document.getElementById(id);
const currency = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
const state = {
  profile: null,
  snapshot: null,
  unsubscribe: null,
  refreshTimer: null,
  pendingAssistanceAlert: false,
  alertSoundEnabled: false,
  audioContext: null
};

function showToast(message) {
  const toast = byId('staff-toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 3200);
}

function updateAlertSoundButton() {
  const button = byId('staff-sound-toggle');
  button.setAttribute('aria-pressed', String(state.alertSoundEnabled));
  button.textContent = state.alertSoundEnabled ? 'Alert sound on' : 'Enable alert sound';
}

async function enableAlertSound({ confirmWithTone = true } = {}) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    showToast('This browser does not support audible staff alerts.');
    return false;
  }
  state.audioContext ||= new AudioContextClass();
  if (state.audioContext.state === 'suspended') await state.audioContext.resume();
  state.alertSoundEnabled = state.audioContext.state === 'running';
  updateAlertSoundButton();
  if (state.alertSoundEnabled && confirmWithTone) {
    playAssistanceAlert();
    showToast('Assistance alert sound enabled.');
  }
  return state.alertSoundEnabled;
}

async function toggleAlertSound() {
  if (state.alertSoundEnabled) {
    state.alertSoundEnabled = false;
    updateAlertSoundButton();
    showToast('Assistance alert sound muted.');
    return;
  }
  await enableAlertSound();
}

function playAssistanceAlert() {
  const context = state.audioContext;
  if (!state.alertSoundEnabled || !context || context.state !== 'running') return;
  const start = context.currentTime;
  for (const offset of [0, 0.2]) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, start + offset);
    gain.gain.setValueAtTime(0.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(0.16, start + offset + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.13);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start + offset);
    oscillator.stop(start + offset + 0.14);
  }
}

function showLogin(error = '') {
  byId('staff-login').hidden = false;
  byId('staff-unauthorized').hidden = true;
  byId('staff-dashboard').hidden = true;
  byId('staff-nav').hidden = true;
  byId('staff-logout').hidden = true;
  const errorHost = byId('staff-login-error');
  errorHost.textContent = error;
  errorHost.hidden = !error;
}

function showUnauthorized() {
  byId('staff-login').hidden = true;
  byId('staff-unauthorized').hidden = false;
  byId('staff-dashboard').hidden = true;
  byId('staff-nav').hidden = true;
  byId('staff-logout').hidden = true;
}

function showDashboard() {
  byId('staff-login').hidden = true;
  byId('staff-unauthorized').hidden = true;
  byId('staff-dashboard').hidden = false;
  byId('staff-nav').hidden = false;
  byId('staff-logout').hidden = false;
  byId('staff-name').textContent = state.profile.full_name;
}

function setPanel(name) {
  for (const panel of document.querySelectorAll('[data-staff-panel]')) panel.hidden = panel.dataset.staffPanel !== name;
  for (const button of document.querySelectorAll('[data-panel]')) button.classList.toggle('active', button.dataset.panel === name);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatWhen(value) {
  return value ? dateTime.format(new Date(value)) : 'Not yet';
}

function renderAssistance() {
  const requests = state.snapshot.assistance;
  const actionable = requests.filter((request) => ['PENDING', 'ACKNOWLEDGED'].includes(request.status));
  const host = byId('assistance-list');
  host.replaceChildren();
  byId('assistance-empty').hidden = actionable.length > 0;
  for (const request of actionable) {
    const card = element('article', `staff-record ${request.status.toLowerCase()}`);
    const copy = element('div');
    copy.append(element('p', 'product-category', request.status === 'PENDING' ? 'Waiting for staff' : 'Staff on the way'));
    copy.append(element('h3', '', request.kiosks?.display_name || request.kiosks?.code || 'UNIVUE kiosk'));
    copy.append(element('p', '', request.message));
    const meta = element('div', 'staff-record-meta');
    meta.append(element('span', '', formatWhen(request.requested_at)));
    meta.append(element('span', '', request.product_code ? `${request.product_code.replaceAll('_', ' ')} · ${request.size || 'No size'}` : 'General assistance'));
    if (request.order_reference) meta.append(element('span', '', `Order ${request.order_reference}`));
    copy.append(meta);
    const actions = element('div', 'staff-record-actions');
    if (request.status === 'PENDING') {
      const acknowledge = element('button', 'primary', 'Acknowledge');
      acknowledge.type = 'button';
      acknowledge.dataset.assistanceId = request.id;
      acknowledge.dataset.assistanceStatus = 'ACKNOWLEDGED';
      actions.append(acknowledge);
    }
    const resolve = element('button', 'secondary', 'Mark resolved');
    resolve.type = 'button';
    resolve.dataset.assistanceId = request.id;
    resolve.dataset.assistanceStatus = 'RESOLVED';
    actions.append(resolve);
    card.append(copy, actions);
    host.append(card);
  }
}

function renderOrders() {
  const orders = state.snapshot.orders;
  const host = byId('orders-list');
  host.replaceChildren();
  byId('orders-empty').hidden = orders.length > 0;
  for (const order of orders) {
    const payment = Array.isArray(order.payments) ? order.payments[0] : order.payments;
    const card = element('article', `staff-record ${order.status.toLowerCase()}`);
    const copy = element('div');
    copy.append(element('p', 'product-category', `${order.status.replaceAll('_', ' ')} · ${payment?.status || 'PENDING'} PAYMENT`));
    copy.append(element('h3', '', `${order.reference} · ${order.customer_name}`));
    const itemText = (order.order_items || []).map((line) => `${line.product_code.replaceAll('_', ' ')} ${line.size} × ${line.quantity}`).join(' · ');
    copy.append(element('p', '', itemText || 'No order items'));
    const meta = element('div', 'staff-record-meta');
    meta.append(element('span', '', `ID ${order.student_id}`));
    meta.append(element('span', '', order.fulfillment.replaceAll('_', ' ')));
    meta.append(element('span', '', order.payment_method));
    meta.append(element('span', '', currency.format(Number(order.total))));
    meta.append(element('span', '', formatWhen(order.created_at)));
    copy.append(meta);
    const actions = element('div', 'staff-record-actions');
    if (order.payment_method === 'CASH' && payment?.status !== 'CONFIRMED' && order.status !== 'CANCELLED') {
      const confirm = element('button', 'primary', 'Confirm payment');
      confirm.type = 'button';
      confirm.dataset.confirmOrder = order.id;
      actions.append(confirm);
    } else if (order.payment_method === 'GCASH' && payment?.status !== 'CONFIRMED' && order.status !== 'CANCELLED') {
      actions.append(element('span', 'staff-payment-note', 'Waiting for PayMongo verification'));
    }
    const select = document.createElement('select');
    select.setAttribute('aria-label', `Update status for ${order.reference}`);
    const statuses = payment?.status === 'CONFIRMED'
      ? ['PAID', 'PREPARING', 'READY', 'COMPLETED']
      : ['AWAITING_PAYMENT', 'CANCELLED'];
    for (const status of statuses) {
      const option = new Option(status.replaceAll('_', ' '), status, false, status === order.status);
      select.add(option);
    }
    select.dataset.orderStatus = order.id;
    actions.append(select);
    card.append(copy, actions);
    host.append(card);
  }
}

function renderInventory() {
  const products = state.snapshot.products;
  const inventory = state.snapshot.inventory;
  const select = byId('staff-product');
  const previous = select.value;
  select.replaceChildren();
  for (const product of products) select.add(new Option(product.name, product.code));
  if (products.some((product) => product.code === previous)) select.value = previous;
  syncInventoryQuantity();

  const host = byId('inventory-grid');
  host.replaceChildren();
  for (const product of products) {
    const card = element('article', 'staff-stock-card');
    card.append(element('h3', '', product.name));
    for (const row of inventory.filter((entry) => entry.product_code === product.code)) {
      const statusClass = row.quantity === 0 ? 'empty' : row.quantity <= 3 ? 'low' : '';
      const line = element('div', `staff-stock-row ${statusClass}`);
      line.append(element('b', '', row.size));
      const meter = element('span', 'stock-meter');
      const fill = element('i');
      fill.style.width = `${Math.max(0, Math.min(100, (row.quantity / 30) * 100))}%`;
      meter.append(fill);
      line.append(meter, element('span', '', `${row.quantity} / 30`));
      card.append(line);
    }
    host.append(card);
  }
}

function syncInventoryQuantity() {
  if (!state.snapshot) return;
  const row = state.snapshot.inventory.find((entry) => entry.product_code === byId('staff-product').value && entry.size === byId('staff-size').value);
  byId('staff-quantity').value = row ? String(row.quantity) : '';
}

function renderSnapshot() {
  const pendingAssistance = state.snapshot.assistance.filter((request) => request.status === 'PENDING').length;
  const pendingOrders = state.snapshot.orders.filter((order) => order.status === 'AWAITING_PAYMENT').length;
  const lowStock = state.snapshot.inventory.filter((entry) => entry.quantity <= 3).length;
  byId('metric-assistance').textContent = pendingAssistance;
  byId('metric-orders').textContent = pendingOrders;
  byId('metric-low-stock').textContent = lowStock;
  byId('metric-database').textContent = 'Live';
  byId('metric-updated').textContent = `Updated ${new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}`;
  byId('nav-assistance-count').textContent = pendingAssistance;
  byId('nav-order-count').textContent = pendingOrders;
  renderAssistance();
  renderOrders();
  renderInventory();
}

async function refreshSnapshot({ quiet = false } = {}) {
  if (!state.profile) return;
  if (!quiet) byId('refresh-dashboard').disabled = true;
  try {
    state.snapshot = await DATA.getStaffSnapshot();
    renderSnapshot();
    byId('staff-live-status').textContent = `Database: live · ${DATA.config.kioskCode}`;
  } catch (error) {
    byId('staff-live-status').textContent = 'Database: unavailable';
    if (!quiet) showToast(error.message || 'Could not refresh UNIVUE data.');
  } finally {
    byId('refresh-dashboard').disabled = false;
  }
}

function scheduleRefresh(table, payload) {
  if (table === 'assistance_requests' && payload?.eventType === 'INSERT') {
    state.pendingAssistanceAlert = true;
  }
  clearTimeout(state.refreshTimer);
  state.refreshTimer = setTimeout(async () => {
    const shouldAlert = state.pendingAssistanceAlert;
    state.pendingAssistanceAlert = false;
    await refreshSnapshot({ quiet: true });
    if (shouldAlert) {
      showToast('New assistance call received.');
      playAssistanceAlert();
      if ('vibrate' in navigator) navigator.vibrate([120, 80, 120]);
    }
  }, 250);
}

async function establishStaffSession() {
  if (!DATA?.isReady()) {
    byId('staff-live-status').textContent = 'Database: configuration unavailable';
    showLogin('The Supabase client could not start. Check the network connection.');
    return;
  }
  try {
    const session = await DATA.getSession();
    if (!session) {
      byId('staff-live-status').textContent = `Database: live · ${DATA.config.kioskCode}`;
      return showLogin();
    }
    state.profile = await DATA.getStaffProfile();
    if (!state.profile?.active) return showUnauthorized();
    showDashboard();
    await refreshSnapshot();
    state.unsubscribe?.();
    state.unsubscribe = DATA.subscribeStaff(scheduleRefresh);
  } catch (error) {
    showLogin(error.message || 'Could not verify the staff session.');
  }
}

byId('staff-login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  enableAlertSound({ confirmWithTone: false }).catch(() => {});
  const loginForm = event.currentTarget;
  const button = byId('staff-login-button');
  const errorHost = byId('staff-login-error');
  button.disabled = true;
  errorHost.hidden = true;
  try {
    await DATA.signIn(byId('staff-email').value.trim(), byId('staff-password').value);
    state.profile = await DATA.getStaffProfile();
    if (!state.profile?.active) return showUnauthorized();
    loginForm.reset();
    showDashboard();
    await refreshSnapshot();
    state.unsubscribe = DATA.subscribeStaff(scheduleRefresh);
  } catch (error) {
    errorHost.textContent = error.message || 'Sign-in failed.';
    errorHost.hidden = false;
  } finally {
    button.disabled = false;
  }
});

byId('staff-logout').addEventListener('click', async () => {
  state.unsubscribe?.();
  state.unsubscribe = null;
  state.profile = null;
  state.snapshot = null;
  state.pendingAssistanceAlert = false;
  state.alertSoundEnabled = false;
  state.audioContext?.close().catch(() => {});
  state.audioContext = null;
  try { await DATA.signOut(); } catch { /* the local session still returns to login */ }
  showLogin();
});

byId('refresh-dashboard').addEventListener('click', () => refreshSnapshot());
byId('staff-sound-toggle').addEventListener('click', () => toggleAlertSound());
byId('staff-product').addEventListener('change', syncInventoryQuantity);
byId('staff-size').addEventListener('change', syncInventoryQuantity);

byId('staff-inventory-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const quantity = Number(byId('staff-quantity').value);
  const message = byId('staff-inventory-message');
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 30) {
    message.textContent = 'Enter a whole number from 0 to 30.';
    return;
  }
  message.textContent = 'Saving live quantity…';
  try {
    await DATA.updateInventory(byId('staff-product').value, byId('staff-size').value, quantity);
    message.textContent = 'Inventory saved. Student kiosks now see the new quantity.';
    await refreshSnapshot({ quiet: true });
  } catch (error) {
    message.textContent = error.message || 'Could not update inventory.';
  }
});

document.addEventListener('click', async (event) => {
  const panelButton = event.target.closest('[data-panel]');
  if (panelButton) setPanel(panelButton.dataset.panel);
  if (event.target.closest('[data-action="return-login"]')) {
    try { await DATA.signOut(); } catch { /* continue */ }
    showLogin();
  }
  const assistButton = event.target.closest('[data-assistance-id]');
  if (assistButton) {
    assistButton.disabled = true;
    try {
      await DATA.updateAssistance(assistButton.dataset.assistanceId, assistButton.dataset.assistanceStatus);
      await refreshSnapshot({ quiet: true });
      showToast(`Assistance marked ${assistButton.dataset.assistanceStatus.toLowerCase()}.`);
    } catch (error) { showToast(error.message || 'Could not update assistance.'); }
  }
  const paymentButton = event.target.closest('[data-confirm-order]');
  if (paymentButton) {
    const order = state.snapshot.orders.find((entry) => entry.id === paymentButton.dataset.confirmOrder);
    if (!order) return;
    paymentButton.disabled = true;
    try {
      const receipt = await DATA.confirmPayment(order);
      const printResult = await DATA.printReceipt(order, receipt.receiptNumber, state.snapshot.products);
      await refreshSnapshot({ quiet: true });
      showToast(printResult.printed
        ? `Payment confirmed. Receipt ${receipt.receiptNumber} was printed.`
        : `Payment confirmed. Receipt ${receipt.receiptNumber} is ready.`);
    } catch (error) { showToast(error.message || 'Could not confirm payment.'); }
  }
});

document.addEventListener('change', async (event) => {
  const statusSelect = event.target.closest('[data-order-status]');
  if (!statusSelect) return;
  statusSelect.disabled = true;
  try {
    await DATA.updateOrderStatus(statusSelect.dataset.orderStatus, statusSelect.value);
    await refreshSnapshot({ quiet: true });
    showToast('Order status updated.');
  } catch (error) { showToast(error.message || 'Could not update order.'); }
  finally { statusSelect.disabled = false; }
});

establishStaffSession();
setInterval(() => refreshSnapshot({ quiet: true }), 15000);
