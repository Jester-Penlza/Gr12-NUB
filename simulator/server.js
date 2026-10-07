'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { InventoryModel } = require('./model');

const WEB_ROOT = path.resolve(__dirname, '..', 'firmware', 'esp32', 'cutte_kiosk_bridge', 'data');
const DEFAULT_PORT = 8080;
const SESSION_TTL_MS = 30 * 60 * 1000;

function json(response, statusCode, payload, headers = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
    ...headers
  });
  response.end(body);
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header.split(';').map((entry) => entry.trim()).filter(Boolean).map((entry) => {
      const split = entry.indexOf('=');
      return split < 0
        ? [entry, '']
        : [entry.slice(0, split), decodeURIComponent(entry.slice(split + 1))];
    })
  );
}

function readJson(request, limit = 16_384) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > limit) reject(Object.assign(new Error('PAYLOAD_TOO_LARGE'), { statusCode: 413 }));
    });
    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(Object.assign(new Error('BAD_JSON'), { statusCode: 400 }));
      }
    });
    request.on('error', reject);
  });
}

function createKioskServer(options = {}) {
  const inventory = options.inventory ?? new InventoryModel(0);
  const adminPin = String(options.adminPin ?? process.env.CUTTE_ADMIN_PIN ?? '2468');
  const sessions = new Map();
  const assist = { sequence: 0, requestedAt: null };

  function sessionFor(request) {
    const token = parseCookies(request.headers.cookie).cutte_session;
    const expiresAt = token && sessions.get(token);
    if (!expiresAt || expiresAt <= Date.now()) {
      if (token) sessions.delete(token);
      return null;
    }
    sessions.set(token, Date.now() + SESSION_TTL_MS);
    return token;
  }

  function serveFile(response, fileName, contentType) {
    const filePath = path.join(WEB_ROOT, fileName);
    if (!filePath.startsWith(`${WEB_ROOT}${path.sep}`) || !fs.existsSync(filePath)) {
      json(response, 404, { error: 'NOT_FOUND' });
      return;
    }
    const body = fs.readFileSync(filePath);
    response.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': body.length,
      'Cache-Control': 'no-cache'
    });
    response.end(body);
  }

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
    try {
      if (request.method === 'GET' && url.pathname === '/') {
        serveFile(response, 'index.html', 'text/html; charset=utf-8');
        return;
      }
      if (request.method === 'GET' && url.pathname === '/styles.css') {
        serveFile(response, 'styles.css', 'text/css; charset=utf-8');
        return;
      }
      if (request.method === 'GET' && url.pathname === '/app.js') {
        serveFile(response, 'app.js', 'text/javascript; charset=utf-8');
        return;
      }
      if (request.method === 'GET' && /^\/images\/(?:products|branding)\/[a-z0-9-]+\.(?:svg|png|jpe?g)$/.test(url.pathname)) {
        const extension = path.extname(url.pathname).toLowerCase();
        const contentType = extension === '.svg' ? 'image/svg+xml; charset=utf-8'
          : extension === '.png' ? 'image/png'
            : 'image/jpeg';
        serveFile(response, url.pathname.slice(1), contentType);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/check') {
        const result = inventory.check(url.searchParams.get('item'), url.searchParams.get('size'));
        json(response, 200, result);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/inventory') {
        const result = inventory.overview(url.searchParams.get('item'));
        json(response, 200, result);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/status') {
        json(response, 200, {
          controller: 'SIMULATOR',
          assistanceSequence: assist.sequence,
          assistanceRequestedAt: assist.requestedAt,
          authenticated: Boolean(sessionFor(request))
        });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/login') {
        const body = await readJson(request);
        if (String(body.pin ?? '') !== adminPin) {
          json(response, 401, { error: 'INVALID_PIN' });
          return;
        }
        const token = crypto.randomBytes(24).toString('hex');
        sessions.set(token, Date.now() + SESSION_TTL_MS);
        json(response, 200, { authenticated: true }, {
          'Set-Cookie': `cutte_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800`
        });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/logout') {
        const token = parseCookies(request.headers.cookie).cutte_session;
        if (token) sessions.delete(token);
        json(response, 200, { authenticated: false }, {
          'Set-Cookie': 'cutte_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'
        });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/update') {
        if (!sessionFor(request)) {
          json(response, 401, { error: 'UNAUTHORIZED' });
          return;
        }
        const body = await readJson(request);
        const result = inventory.update(body.item, body.size, body.quantity);
        json(response, 200, { ...result, confirmed: true });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/simulate/assist') {
        assist.sequence += 1;
        assist.requestedAt = new Date().toISOString();
        json(response, 200, { assistanceSequence: assist.sequence });
        return;
      }
      json(response, 404, { error: 'NOT_FOUND' });
    } catch (error) {
      const known = ['UNKNOWN_ITEM', 'UNKNOWN_SIZE', 'BAD_QUANTITY'];
      const code = known.includes(error.message) ? error.message : 'BAD_REQUEST';
      json(response, error.statusCode ?? 400, { error: code });
    }
  });

  return { server, inventory, assist };
}

if (require.main === module) {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  const { server } = createKioskServer();
  server.listen(port, '127.0.0.1', () => {
    console.log(`CUTTE kiosk simulator: http://127.0.0.1:${port}`);
    console.log('Development only: quantities are in memory and reset when the process stops.');
  });
}

module.exports = { createKioskServer, parseCookies, readJson };
