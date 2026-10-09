'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createKioskServer } = require('../simulator/server');

async function request(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const body = await response.json();
  return { response, body };
}

test('web assets are served with the required kiosk screens', async (t) => {
  const { server } = createKioskServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const htmlResponse = await fetch(`${baseUrl}/`);
  const html = await htmlResponse.text();
  assert.equal(htmlResponse.status, 200);
  for (const screen of ['home', 'category', 'gender', 'garment', 'size', 'confirm', 'result', 'cart', 'checkout', 'order-success', 'error', 'admin-login', 'admin-inventory']) {
    assert.match(html, new RegExp(`data-screen="${screen}"`));
  }
  assert.match(html, /UNIVUE \| NU Baliwag Uniform View/);
  assert.match(html, /Payment requires staff confirmation/);
  assert.match(html, /NU Baliwag/);
  assert.match(html, /Bulldogs Exchange/);
  assert.match(html, /Student \/ Employee ID/);
  assert.match(html, /College \/ Department/);
  assert.match(html, /Contact number/);
  assert.match(html, /Pickup or delivery/);
  assert.match(html, /Notes to school office/);
  assert.match(html, /Know the stock before you order/);
  assert.match(html, /Available: 4–30/);
  assert.match(html, /Low stock: 1–3/);
  assert.match(html, /Out of stock: 0/);
  assert.match(html, /data-action="toggle-stock"/);
  assert.match(html, /id="result-stock-quantity"/);
  assert.doesNotMatch(html, /legend-light|result-light-dot|status-light-panel/);
  assert.match(html, /Verified replacement quantity \(0–30\)/);
  assert.match(html, /data-action="request-assistance"/);
  assert.match(html, /GCash via official school QR/);

  const cssResponse = await fetch(`${baseUrl}/styles.css`);
  assert.match(cssResponse.headers.get('content-type'), /^text\/css/);
  assert.ok((await cssResponse.text()).length > 1000);

  const scriptResponse = await fetch(`${baseUrl}/app.js`);
  assert.match(scriptResponse.headers.get('content-type'), /^text\/javascript/);
  assert.ok((await scriptResponse.text()).length > 1000);

  const staffResponse = await fetch(`${baseUrl}/staff.html`);
  assert.equal(staffResponse.status, 200);
  const staffHtml = await staffResponse.text();
  assert.match(staffHtml, /Assistance queue/);
  assert.match(staffHtml, /Recent orders/);
  assert.match(staffHtml, /Inventory manager/);

  for (const asset of ['/staff.css', '/staff.js', '/supabase-config.js', '/univue-data.js']) {
    const response = await fetch(`${baseUrl}${asset}`);
    assert.equal(response.status, 200, `${asset} should be served`);
  }

  const imageResponse = await fetch(`${baseUrl}/images/products/male-polo.png`);
  assert.match(imageResponse.headers.get('content-type'), /^image\/png/);
  assert.ok((await imageResponse.arrayBuffer()).byteLength > 100_000);

  const logoResponse = await fetch(`${baseUrl}/images/branding/nu-shield.png`);
  assert.match(logoResponse.headers.get('content-type'), /^image\/png/);
  assert.ok((await logoResponse.arrayBuffer()).byteLength > 1_000_000);
});

test('item overview returns all six current size counts without changing them', async (t) => {
  const { server, inventory } = createKioskServer();
  inventory.update('T_SHIRT', 'XS', 0);
  inventory.update('T_SHIRT', 'S', 2);
  inventory.update('T_SHIRT', 'M', 30);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const result = await request(baseUrl, '/inventory?item=T_SHIRT');
  assert.equal(result.response.status, 200);
  assert.equal(result.body.maxQuantity, 30);
  assert.equal(result.body.sizes.length, 6);
  assert.deepEqual(result.body.sizes.slice(0, 3).map(({ size, quantity, status }) => ({ size, quantity, status })), [
    { size: 'XS', quantity: 0, status: 'OUT_OF_STOCK' },
    { size: 'S', quantity: 2, status: 'LOW_STOCK' },
    { size: 'M', quantity: 30, status: 'AVAILABLE' }
  ]);
  assert.equal(inventory.check('T_SHIRT', 'M').quantity, 30);
});

test('cart checkout uses the live order RPC and never collects payment credentials', async (t) => {
  const { server } = createKioskServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const script = await (await fetch(`${baseUrl}/app.js`)).text();
  assert.match(script, /async function placeOrder/);
  assert.match(script, /\/check\?item=/);
  assert.match(script, /DATA\.placeOrder/);
  assert.match(script, /AWAITING_COUNTER_PAYMENT/);
  assert.match(script, /collegeDepartment/);
  assert.match(script, /contactNumber/);
  assert.match(script, /fulfillment/);
  assert.doesNotMatch(script, /cardNumber|cvv|expiryDate/);
});

test('hardware indicator endpoint validates and records a Raspberry Pi LED command', async (t) => {
  const { server, hardware } = createKioskServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const result = await request(baseUrl, '/hardware/indicator', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item: 'T_SHIRT', size: 'M', quantity: 2, status: 'LOW_STOCK' })
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.confirmed, true);
  assert.deepEqual(hardware.indicator, { item: 'T_SHIRT', size: 'M', quantity: 2, status: 'LOW_STOCK' });

  const invalid = await request(baseUrl, '/hardware/indicator', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'PURPLE' })
  });
  assert.equal(invalid.response.status, 400);
});

test('HTTP flow enforces authentication and confirms updates', async (t) => {
  const { server } = createKioskServer({ adminPin: '1357' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  let result = await request(baseUrl, '/check?item=T_SHIRT&size=M');
  assert.equal(result.response.status, 200);
  assert.equal(result.body.quantity, 0);

  result = await request(baseUrl, '/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item: 'T_SHIRT', size: 'M', quantity: 12 })
  });
  assert.equal(result.response.status, 401);

  result = await request(baseUrl, '/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: 'wrong' })
  });
  assert.equal(result.response.status, 401);

  result = await request(baseUrl, '/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '1357' })
  });
  assert.equal(result.response.status, 200);
  const cookie = result.response.headers.get('set-cookie').split(';')[0];

  result = await request(baseUrl, '/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ item: 'T_SHIRT', size: 'M', quantity: 12 })
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.confirmed, true);

  result = await request(baseUrl, '/check?item=T_SHIRT&size=M');
  assert.equal(result.body.quantity, 12);
  assert.equal(result.body.status, 'AVAILABLE');
});

test('invalid update never changes the previous quantity', async (t) => {
  const { server, inventory } = createKioskServer({ adminPin: '2468' });
  inventory.update('PE_UNIFORM', 'XL', 9);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const login = await request(baseUrl, '/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '2468' })
  });
  const cookie = login.response.headers.get('set-cookie').split(';')[0];

  const invalid = await request(baseUrl, '/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ item: 'PE_UNIFORM', size: 'XL', quantity: '1.5' })
  });
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.body.error, 'BAD_QUANTITY');
  assert.equal(inventory.check('PE_UNIFORM', 'XL').quantity, 9);

  const oversized = await request(baseUrl, '/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ item: 'PE_UNIFORM', size: 'XL', quantity: 31 })
  });
  assert.equal(oversized.response.status, 400);
  assert.equal(oversized.body.error, 'BAD_QUANTITY');
  assert.equal(inventory.check('PE_UNIFORM', 'XL').quantity, 9);
});

test('controller errors return errors instead of invented stock', async (t) => {
  const { server } = createKioskServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const badItem = await request(baseUrl, '/check?item=NOPE&size=M');
  assert.equal(badItem.response.status, 400);
  assert.deepEqual(badItem.body, { error: 'UNKNOWN_ITEM' });

  const badSize = await request(baseUrl, '/check?item=T_SHIRT&size=NOPE');
  assert.equal(badSize.response.status, 400);
  assert.deepEqual(badSize.body, { error: 'UNKNOWN_SIZE' });
});
