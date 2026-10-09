'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

test('GitHub Pages build contains the UNIVUE kiosk, staff portal, and live Supabase client', () => {
  execFileSync(process.execPath, [path.join(root, 'scripts', 'build-pages.js')], { cwd: root });
  const html = fs.readFileSync(path.join(root, 'dist', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'dist', 'app.js'), 'utf8');

  assert.match(html, /data-runtime="github-pages"/);
  assert.match(html, /href="\.\/styles\.css"/);
  assert.match(html, /src="\.\/app\.js"/);
  assert.match(html, /UNIVUE \| NU Baliwag Uniform View/);
  assert.match(html, /supabase-config\.js/);
  assert.match(html, /univue-data\.js/);
  assert.doesNotMatch(html, /qrcode\.min\.js/);
  assert.doesNotMatch(html, /(?:src|href)="\/(?:images|styles\.css|app\.js)/);
  assert.match(app, /LIVE_DATABASE_MODE/);
  assert.match(app, /DATA\.placeOrder/);
  assert.match(app, /DATA\.createPaymongoCheckout/);
  assert.match(html, /PAYMONGO TEST MODE/);
  assert.match(html, /Generate test QR again/);
  assert.match(app, /checkout\?\.qrImageUrl/);
  assert.match(app, /new Image\(\)/);
  assert.match(app, /Expires in/);
  assert.match(app, /renderPaymongoQr/);
  assert.match(app, /DATA\.requestAssistance/);
  assert.match(app, /'\.\/images\/products\/male-polo\.png'/);
  assert.ok(fs.statSync(path.join(root, 'dist', 'images', 'branding', 'nu-shield.png')).size > 1_000_000);
  const staff = fs.readFileSync(path.join(root, 'dist', 'staff.html'), 'utf8');
  const staffApp = fs.readFileSync(path.join(root, 'dist', 'staff.js'), 'utf8');
  assert.match(staff, /UNIVUE Staff/);
  assert.match(staff, /src="\.\/staff\.js"/);
  assert.match(staff, /href="\.\/staff\.css"/);
  assert.doesNotMatch(staff, /(?:src|href)="\/(?:images|styles\.css|staff\.css|staff\.js|supabase-config\.js|univue-data\.js)/);
  assert.match(staffApp, /const loginForm = event\.currentTarget;/);
  assert.match(staffApp, /loginForm\.reset\(\);/);
  assert.doesNotMatch(staffApp, /await[\s\S]{0,500}event\.currentTarget\.reset\(\)/);
  assert.match(staffApp, /Waiting for PayMongo verification/);
  assert.match(staff, /id="staff-sound-toggle"/);
  assert.match(staffApp, /function playAssistanceAlert/);
  assert.match(staffApp, /payload\?\.eventType === 'INSERT'/);
  assert.match(staffApp, /New assistance call received/);
  assert.match(staff, /id="clear-closed-orders"/);
  assert.match(staffApp, /DATA\.archiveOrder/);
  assert.match(staffApp, /DATA\.archiveClosedOrders/);
  assert.match(staffApp, /\['CANCELLED', 'COMPLETED'\]/);
  assert.match(staffApp, /Audit records were retained/);
});

test('order history cleanup archives only closed orders and preserves audit data', () => {
  const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '202610090010_order_history_archive.sql'), 'utf8');

  assert.match(migration, /private\.is_staff\(\)/);
  assert.match(migration, /status not in \('CANCELLED', 'COMPLETED'\)/);
  assert.match(migration, /ONLY_CLOSED_ORDERS_CAN_BE_ARCHIVED/);
  assert.match(migration, /archived_at = coalesce\(archived_at, now\(\)\)/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.orders/i);
});

test('PayMongo integration keeps secret keys server-side and verifies signed webhooks', () => {
  const checkout = fs.readFileSync(path.join(root, 'supabase', 'functions', 'create-paymongo-checkout', 'index.ts'), 'utf8');
  const webhook = fs.readFileSync(path.join(root, 'supabase', 'functions', 'paymongo-webhook', 'index.ts'), 'utf8');
  const browserFiles = [
    'index.html', 'app.js', 'univue-data.js', 'supabase-config.js', 'staff.js'
  ].map((name) => fs.readFileSync(path.join(root, 'firmware', 'esp32', 'cutte_kiosk_bridge', 'data', name), 'utf8')).join('\n');

  assert.match(checkout, /PAYMONGO_SECRET_KEY_TEST/);
  assert.match(checkout, /payment_intents/);
  assert.match(checkout, /payment_methods/);
  assert.match(checkout, /payment_method_allowed: \["qrph"\]/);
  assert.match(checkout, /next_action\?\.code\?\.image_url/);
  assert.match(checkout, /awaiting_next_action/);
  assert.match(checkout, /testMode: true/);
  assert.match(webhook, /Paymongo-Signature/);
  assert.match(webhook, /HMAC/);
  assert.match(webhook, /checkout_session\.payment\.paid/);
  assert.match(webhook, /payment\.paid/);
  assert.doesNotMatch(browserFiles, /sk_(?:test|live)_/);
});
