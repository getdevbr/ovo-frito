/**
 * Servidor local zero-dependências (fallback / modo portátil rápido 100% Local-First)
 * Compartilha exatamente o mesmo diretório portátil `./data/` e o contrato IPC (`pm:storage:*`, `pm:runtime:request`)
 * do processo principal Electron (`main.js`).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createStorage } = require('./main/storage');
const { createCookieJar } = require('./main/cookie-jar');
const { createHttpEngine } = require('./main/http-engine');

const PORT = process.env.PORT || 3456;
const DATA_DIR = process.env.CDO_DATA_DIR
  ? path.resolve(process.env.CDO_DATA_DIR)
  : path.join(__dirname, 'data');
const RENDERER_DIR = path.join(__dirname, 'renderer');

const storage = createStorage({ dataDir: DATA_DIR });
const cookieJar = createCookieJar(storage);
const httpEngine = createHttpEngine({ storage, cookieJar });

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

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/ipc') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      try {
        const { channel, payload } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        let result = null;
        if (channel === 'pm:storage:loadAll') {
          result = {
            collections: storage.readStore('collections') || [],
            environments: storage.readStore('environments') || [],
            history: storage.readStore('history') || [],
            settings: storage.readStore('settings') || { theme: 'dark', activeEnvironmentId: '' },
            sessions: storage.readStore('sessions') || { tabs: [], activeTabId: null, responseCache: {} },
            cookies: storage.readStore('cookies') || [],
            dataDir: DATA_DIR
          };
        } else if (channel === 'pm:storage:save') {
          result = { ok: storage.writeStore(payload.key, payload.data) };
        } else if (channel === 'pm:runtime:request') {
          result = await httpEngine.executeHttpRequest(payload);
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: { code: 'UNSUPPORTED_IN_WEB_MODE', message: `Canal IPC desconhecido ou não suportado no modo web: ${channel}` } }));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(RENDERER_DIR, path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, ''));

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Carteiro (100% Local-First) rodando em http://127.0.0.1:${PORT}`);
});
