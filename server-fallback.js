/**
 * Servidor local zero-dependências (fallback / modo portátil rápido 100% Local-First)
 * Compartilha exatamente o mesmo diretório portátil `./data/` e o contrato IPC (`pm:storage:*`, `pm:runtime:request`)
 * do processo principal Electron (`main.js`).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createAppContext } = require('./main/bootstrap');
const { dispatchWebIpc } = require('./main/ipc/http-bridge');

const PORT = Number(process.env.PORT || 3456);
const DATA_DIR = process.env.CDO_DATA_DIR
  ? path.resolve(process.env.CDO_DATA_DIR)
  : path.join(__dirname, 'data');
const RENDERER_DIR = path.join(__dirname, 'renderer');

const { storage, httpEngine, vault, dbEngine, oauthTokenManager, gitSync } = createAppContext({ dataDir: DATA_DIR });

storage.ensurePortableDataDir();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ovo': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'SAMEORIGIN',
  'Cache-Control': 'no-store'
};

const MAX_BODY_BYTES = 10 * 1024 * 1024;
const ALLOWED_ORIGINS = new Set([
  `http://127.0.0.1:${PORT}`,
  `http://localhost:${PORT}`,
  `http://[::1]:${PORT}`
]);

function isAllowedHost(hostHeader) {
  if (!hostHeader) return false;
  const host = String(hostHeader).toLowerCase();
  return (
    host === `127.0.0.1:${PORT}` ||
    host === `localhost:${PORT}` ||
    host === `[::1]:${PORT}` ||
    host === '127.0.0.1' ||
    host === 'localhost' ||
    host === '[::1]'
  );
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...SECURITY_HEADERS });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  // Anti DNS-rebinding: só aceita Host local
  if (!isAllowedHost(req.headers.host)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS });
    return res.end('Forbidden');
  }

  if (req.method === 'POST' && req.url === '/api/ipc') {
    // Anti-CSRF: exige Content-Type JSON + header customizado (força preflight CORS)
    const contentType = String(req.headers['content-type'] || '');
    if (req.headers['x-ovo-csrf'] !== '1' || !contentType.startsWith('application/json')) {
      return sendJson(res, 403, { ok: false, error: { code: 'CSRF_REJECTED', message: 'Missing CSRF header' } });
    }
    const origin = req.headers.origin;
    if (origin && !ALLOWED_ORIGINS.has(String(origin))) {
      return sendJson(res, 403, { ok: false, error: { code: 'ORIGIN_REJECTED', message: 'Origin not allowed' } });
    }

    let bodySize = 0;
    let tooLarge = false;
    const chunks = [];
    req.on('data', (c) => {
      if (tooLarge) return;
      bodySize += c.length;
      if (bodySize > MAX_BODY_BYTES) {
        tooLarge = true;
        sendJson(res, 413, { ok: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Payload excede 10 MB' } });
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('error', () => {});
    req.on('end', async () => {
      if (tooLarge) return;
      try {
        const { channel, payload } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const result = await dispatchWebIpc(
          { storage, httpEngine, vault, dbEngine, oauthTokenManager, gitSync, dataDir: DATA_DIR },
          channel,
          payload
        );
        if (result === null) {
          return sendJson(res, 400, { ok: false, error: { code: 'UNSUPPORTED_IN_WEB_MODE', message: `Canal IPC desconhecido ou não suportado no modo web: ${channel}` } });
        }
        sendJson(res, 200, result);
      } catch (err) {
        console.error('[server-fallback] /api/ipc error:', err);
        sendJson(res, 500, { ok: false, error: { code: 'INTERNAL', message: 'Internal server error' } });
      }
    });
    return;
  }

  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.resolve(RENDERER_DIR, decodeURIComponent(reqPath).replace(/^\/+/, ''));
  if (!filePath.startsWith(RENDERER_DIR + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS });
    return res.end('Forbidden');
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream', ...SECURITY_HEADERS });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS });
    res.end('Not found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Ovo Frito (100% Local-First) rodando em http://127.0.0.1:${PORT}`);
});
