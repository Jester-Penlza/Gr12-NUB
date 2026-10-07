'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'firmware', 'esp32', 'cutte_kiosk_bridge', 'data');
const destination = path.join(root, 'dist');

if (path.dirname(destination) !== root) throw new Error('Unsafe Pages output path');
fs.rmSync(destination, { recursive: true, force: true });
fs.cpSync(source, destination, { recursive: true });

const htmlPath = path.join(destination, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8')
  .replace('<html lang="en">', '<html lang="en" data-runtime="github-pages">')
  .replaceAll('src="/images/', 'src="./images/')
  .replace('href="/styles.css"', 'href="./styles.css"')
  .replace('src="/app.js"', 'src="./app.js"');
fs.writeFileSync(htmlPath, html);

const appPath = path.join(destination, 'app.js');
const app = fs.readFileSync(appPath, 'utf8').replaceAll("'/images/", "'./images/");
fs.writeFileSync(appPath, app);
fs.writeFileSync(path.join(destination, '.nojekyll'), '');

console.log(`GitHub Pages site built at ${destination}`);
