'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const arduino = fs.readFileSync(path.join(root, 'firmware', 'arduino', 'cutte_stock_controller', 'cutte_stock_controller.ino'), 'utf8');
const esp32 = fs.readFileSync(path.join(root, 'firmware', 'esp32', 'cutte_kiosk_bridge', 'cutte_kiosk_bridge.ino'), 'utf8');
const app = fs.readFileSync(path.join(root, 'firmware', 'esp32', 'cutte_kiosk_bridge', 'data', 'app.js'), 'utf8');

test('Arduino firmware preserves the fixed inventory order and 6x6 layout', () => {
  assert.match(arduino, /ITEM_COUNT = 6/);
  assert.match(arduino, /SIZE_COUNT = 6/);
  assert.match(arduino, /"MALE_POLO", "FEMALE_BLOUSE", "MALE_PANTS"/);
  assert.match(arduino, /"FEMALE_SKIRT", "T_SHIRT", "PE_UNIFORM"/);
  assert.match(arduino, /"XS", "S", "M", "L", "XL", "XXL"/);
  assert.match(arduino, /\(itemIndex \* SIZE_COUNT\) \+ sizeIndex/);
});

test('Arduino firmware exposes every required controller function', () => {
  for (const name of ['initializeInventory', 'loadInventory', 'findItemCode', 'findSizeCode', 'statusFor', 'setStatusLeds', 'processGet', 'processPeek', 'processSet', 'processCommand', 'monitorAssistanceButton']) {
    assert.match(arduino, new RegExp(`\\b${name}\\s*\\(`));
  }
  assert.match(arduino, /EEPROM\.update\(eepromAddress\(itemIndex, sizeIndex\), quantity\)/);
  assert.match(arduino, /ASSIST\|REQUESTED/);
  assert.match(arduino, /MAX_QUANTITY = 30/);
  assert.match(arduino, /strcmp\(parts\[0\], "PEEK"\)/);
});

test('ESP32 firmware implements the required routes, timeout, session, and confirmation gate', () => {
  for (const route of ['/', '/check', '/inventory', '/status', '/login', '/logout', '/update']) {
    assert.ok(esp32.includes(`server.on("${route}"`), `missing route ${route}`);
  }
  assert.match(esp32, /CONTROLLER_TIMEOUT_MS/);
  assert.match(esp32, /SESSION_TTL_MS/);
  assert.match(esp32, /parts\[0\] != "UPDATED"/);
  assert.match(esp32, /sendError\(504, "TIMEOUT"\)/);
  assert.match(esp32, /MAX_QUANTITY = 30/);
  assert.match(esp32, /PEEK\|/);
});

test('web logic keeps formal garments gender-filtered and unisex items gender-free', () => {
  assert.match(app, /MALE_POLO: \{ label: 'Male Polo', category: 'FORMAL', gender: 'MALE' \}/);
  assert.match(app, /FEMALE_SKIRT: \{ label: 'Female Skirt', category: 'FORMAL', gender: 'FEMALE' \}/);
  assert.match(app, /T_SHIRT: \{ label: 'School T-Shirt \(Unisex\)', category: 'T_SHIRT', gender: null \}/);
  assert.match(app, /if \(category === 'FORMAL'\) showScreen\('gender'\);\s*else showSize\(\);/);
  assert.match(app, /const MAX_QUANTITY = 30/);
  assert.match(app, /\/inventory\?item=/);
  assert.match(app, /LIVE_DATABASE_MODE/);
  assert.match(app, /DATA\.checkInventory/);
});
