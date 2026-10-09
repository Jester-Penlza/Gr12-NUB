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
  assert.doesNotMatch(html, /(?:src|href)="\/(?:images|styles\.css|app\.js)/);
  assert.match(app, /LIVE_DATABASE_MODE/);
  assert.match(app, /DATA\.placeOrder/);
  assert.match(app, /DATA\.requestAssistance/);
  assert.match(app, /'\.\/images\/products\/male-polo\.png'/);
  assert.ok(fs.statSync(path.join(root, 'dist', 'images', 'branding', 'nu-shield.png')).size > 1_000_000);
  const staff = fs.readFileSync(path.join(root, 'dist', 'staff.html'), 'utf8');
  assert.match(staff, /UNIVUE Staff/);
  assert.match(staff, /src="\.\/staff\.js"/);
  assert.match(staff, /href="\.\/staff\.css"/);
  assert.doesNotMatch(staff, /(?:src|href)="\/(?:images|styles\.css|staff\.css|staff\.js|supabase-config\.js|univue-data\.js)/);
});
