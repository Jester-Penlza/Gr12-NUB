'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

test('GitHub Pages build is self-contained and enables the labeled demo controller', () => {
  execFileSync(process.execPath, [path.join(root, 'scripts', 'build-pages.js')], { cwd: root });
  const html = fs.readFileSync(path.join(root, 'dist', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'dist', 'app.js'), 'utf8');

  assert.match(html, /data-runtime="github-pages"/);
  assert.match(html, /href="\.\/styles\.css"/);
  assert.match(html, /src="\.\/app\.js"/);
  assert.match(html, /Online demonstration/);
  assert.doesNotMatch(html, /(?:src|href)="\/(?:images|styles\.css|app\.js)/);
  assert.match(app, /STATIC_DEMO_MODE/);
  assert.match(app, /GITHUB DEMO/);
  assert.match(app, /cutte_github_demo_inventory_v1/);
  assert.match(app, /'\.\/images\/products\/male-polo\.png'/);
  assert.ok(fs.statSync(path.join(root, 'dist', 'images', 'branding', 'nu-shield.png')).size > 1_000_000);
});
