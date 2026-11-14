'use strict';

const http = require('node:http');
const net = require('node:net');
const { EventEmitter } = require('node:events');
const { CdoError } = require('../errors');

const ALLOWED_BIND_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

function createProxyInterceptor({ httpEngine, maxEntries = 500, maxBodyBytes = 1048576 } = {}) {
  const emitter = new EventEmitter();
  let server = null;
  let currentConfig = null;
  const entries = [];
  const sockets = new Set();

  function trackSocket(sock) {
    sockets.add(sock);
    sock.on('close', () => sockets.delete(sock));
    sock.on('error', () => sockets.delete(sock));
  }

  function pushEntry(entry) {
    entries.push(entry);
    if (entries.length > maxEntries) entries.shift();
    emitter.emit('entry', entry);
  }

  async function start({ port = 8888, host = '127.0.0.1' } = {}) {
    if (server) await stop();
    if (!ALLOWED_BIND_HOSTS.has(String(host))) {
      throw new CdoError('INVALID_HOST', `Host de bind não permitido: ${host}. Use 127.0.0.1/localhost/::1.`);
    }
    const boundPort = Number(port);

    const isSelfTarget = (targetHost, targetPort) => {
      const h = String(targetHost || '').toLowerCase();
      const p = Number(targetPort) || 0;
      return p === boundPort && (h === '127.0.0.1' || h === 'localhost' || h === '::1' || h === server?.address?.()?.address);
    };

    server = http.createServer((req, res) => {
      try {
        const u = new URL(/^https?:\/\//i.test(req.url) ? req.url : `http://${req.headers.host}${req.url}`);
        if (isSelfTarget(u.hostname, u.port || (u.protocol === 'https:' ? 443 : 80))) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Loopback ao próprio proxy bloqueado' }));
          return;
        }
      } catch {}
      const startNs = process.hrtime.bigint();
      const chunks = [];
      let total = 0;

      req.on('data', (chunk) => {
        if (total < maxBodyBytes) {
          chunks.push(chunk.subarray(0, maxBodyBytes - total));
        }
        total += chunk.length;
      });

      req.on('end', async () => {
        const reqBody = Buffer.concat(chunks).toString('utf8');
        const targetUrl = /^https?:\/\//i.test(req.url) ? req.url : `http://${req.headers.host}${req.url}`;
        const headersArr = Object.entries(req.headers || {})
          .filter(([k]) => !['host', 'proxy-connection', 'content-length'].includes(k.toLowerCase()))
          .map(([key, value]) => ({ key, value: Array.isArray(value) ? value.join(', ') : String(value), enabled: true }));

        const result = await httpEngine.executeHttpRequest({
          method: req.method,
          url: targetUrl,
          headers: headersArr,
          body: reqBody ? { mode: 'raw', raw: reqBody } : { mode: 'none' },
          network: { proxy: { enabled: false } }
        });

        const ms = Math.round(Number(process.hrtime.bigint() - startNs) / 1e6);
        const resBody = String(result.body || '').slice(0, maxBodyBytes);

        pushEntry({
          id: `cap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          kind: 'http',
          method: req.method,
          url: targetUrl,
          status: result.status || 502,
          timeMs: ms,
          reqHeaders: req.headers,
          resHeaders: result.headers || {},
          reqBody,
          resBody
        });

        if (result.ok) {
          res.writeHead(result.status || 200, result.headers || {});
          res.end(result.body || '');
        } else {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: result.error || 'Bad Gateway' }));
        }
      });
    });

    server.on('connection', trackSocket);

    server.on('connect', (req, clientSocket, head) => {
      trackSocket(clientSocket);
      const [targetHost, targetPortStr] = String(req.url || '').split(':');
      const targetPort = Number(targetPortStr) || 443;
      const startNs = process.hrtime.bigint();
      let bytesTransferred = 0;

      if (isSelfTarget(targetHost, targetPort)) {
        clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        clientSocket.destroy();
        return;
      }

      const serverSocket = net.connect(targetPort, targetHost, () => {
        trackSocket(serverSocket);
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head && head.length) {
          serverSocket.write(head);
          bytesTransferred += head.length;
        }
        serverSocket.pipe(clientSocket);
        clientSocket.pipe(serverSocket);
      });

      serverSocket.on('data', (c) => {
        bytesTransferred += c.length;
      });
      serverSocket.on('close', () => {
        const ms = Math.round(Number(process.hrtime.bigint() - startNs) / 1e6);
        pushEntry({
          id: `cap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          kind: 'connect',
          method: 'CONNECT',
          url: `https://${targetHost}:${targetPort}`,
          status: 200,
          timeMs: ms,
          bytesTransferred,
          note: 'HTTPS — conteúdo criptografado'
        });
      });
      serverSocket.on('error', () => clientSocket.destroy());
      clientSocket.on('error', () => serverSocket.destroy());
    });

    await new Promise((resolve, reject) => {
      server.once('error', (err) => {
        reject(new CdoError(err.code || 'CAPTURE_START_ERROR', err.message));
      });
      server.listen(Number(port), host, resolve);
    });

    const addr = server.address();
    currentConfig = {
      running: true,
      host: addr.address,
      port: addr.port,
      url: `http://${addr.address}:${addr.port}`
    };
    return currentConfig;
  }

  async function stop() {
    if (!server) return { ok: true };
    const s = server;
    server = null;
    currentConfig = null;
    for (const sock of sockets) {
      try { sock.destroy(); } catch {}
    }
    sockets.clear();
    s.closeAllConnections?.();
    await new Promise((resolve) => s.close(() => resolve()));
    return { ok: true };
  }

  function clear() {
    entries.length = 0;
  }

  function list() {
    return entries.slice();
  }

  function status() {
    return currentConfig || { running: false };
  }

  return {
    start,
    stop,
    clear,
    list,
    status,
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter)
  };
}

module.exports = {
  createProxyInterceptor
};
