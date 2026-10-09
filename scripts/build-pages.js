'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'firmware', 'esp32', 'cutte_kiosk_bridge', 'data');
const destination = path.join(root, 'dist');

if (path.dirname(destination) !== root) throw new Error('Unsafe Pages output path');
fs.rmSync(destination, { recursive: true, force: true });
fs.cpSync(source, destination, { recursive: true });

for (const fileName of ['index.html', 'staff.html']) {
  const htmlPath = path.join(destination, fileName);
  let html = fs.readFileSync(htmlPath, 'utf8')
    .replaceAll('src="/images/', 'src="./images/')
    .replaceAll('href="/styles.css"', 'href="./styles.css"')
    .replaceAll('href="/staff.css"', 'href="./staff.css"')
    .replaceAll('src="/supabase-config.js"', 'src="./supabase-config.js"')
    .replaceAll('src="/univue-data.js"', 'src="./univue-data.js"')
    .replaceAll('src="/staff.js"', 'src="./staff.js"')
    .replaceAll('src="/app.js"', 'src="./app.js"');
  if (fileName === 'index.html') html = html.replace('<html lang="en">', '<html lang="en" data-runtime="github-pages">');
  fs.writeFileSync(htmlPath, html);
}

const appPath = path.join(destination, 'app.js');
const app = fs.readFileSync(appPath, 'utf8').replaceAll("'/images/", "'./images/");
fs.writeFileSync(appPath, app);
fs.writeFileSync(path.join(destination, '.nojekyll'), '');

console.log(`GitHub Pages site built at ${destination}`);
