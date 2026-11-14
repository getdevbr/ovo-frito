'use strict';

const http = require('node:http');
const { EventEmitter } = require('node:events');
const { compileRoutes, matchRoute } = require('../../renderer/lib/route-matcher');
const { interpolateString } = require('../../renderer/lib/interpolate');
const { GENERATOR_MAP } = require('../../renderer/lib/generators-br');
const { CdoError } = require('../errors');

function pickMockResponse(item, reqHeaders) {
  const examples = Array.isArray(item.mockExamples) ? item.mockExamples : [];
  const requestedName = reqHeaders['x-mock-example'];
  let chosen = null;

  if (requestedName) {
    chosen = examples.find((e) => e.name === requestedName) || null;
  }
  if (!chosen) {
    chosen = examples.find((e) => e.isDefault) || examples[0] || null;
  }

  let status = chosen?.status ?? item.history?.[0]?.status ?? 200;
  if (reqHeaders['x-mock-status'] && Number.isFinite(Number(reqHeaders['x-mock-status']))) {
    status = Number(reqHeaders['x-mock-status']);
  }

  const headers = {};
  if (Array.isArray(chosen?.headers)) {
    for (const h of chosen.headers) {
      if (h && h.enabled !== false && h.key) headers[h.key] = String(h.value ?? '');
    }
  }
  if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
    headers['Content-Type'] = 'application/json; charset=utf-8';
  }

  const rawBody = chosen?.body ?? item.history?.[0]?.responseBody ?? JSON.stringify({ mock: true, item: item.name });
  const body = interpolateString(String(rawBody), { generators: GENERATOR_MAP });
  const delayMs = Math.max(0, Number(chosen?.delayMs) || 0);

  return { status, headers, body, delayMs };
}

const ALLOWED_BIND_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

function createMockServer({ storage, onLog } = {}) {
  const emitter = new EventEmitter();
  let server = null;
  let compiledRoutes = [];
  let currentConfig = null;
  const logs = [];

  function pushLog(entry) {
    logs.push(entry);
    if (logs.length > 1000) logs.shift();
    emitter.emit('log', entry);
    if (typeof onLog === 'function') onLog(entry);
  }

  function rebuildRoutes(collectionId, variables = {}) {
    const collections = storage.readStore('collections') || [];
    const col = collections.find((c) => c.id === collectionId);
    compiledRoutes = col ? compileRoutes(col.items || [], variables) : [];
    return compiledRoutes.map((r) => ({ method: r.method, pathname: r.pathname, itemId: r.item.id, name: r.item.name }));
  }

  async function start({ collectionId, port = 4000, host = '127.0.0.1', cors = true, variables = {} }) {
    if (server) {
      await stop();
    }
    if (!ALLOWED_BIND_HOSTS.has(String(host))) {
      throw new CdoError('INVALID_HOST', `Host de bind não permitido: ${host}. Use 127.0.0.1/localhost/::1.`);
    }
    const routesSummary = rebuildRoutes(collectionId, variables);

    server = http.createServer((req, res) => {
      const startNs = process.hrtime.bigint();
      if (cors) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');
        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }
      }

      const match = matchRoute(compiledRoutes, req.method, req.url || '/');
      if (!match) {
        const ms = Math.round(Number(process.hrtime.bigint() - startNs) / 1e6);
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(
          JSON.stringify({
            error: 'Rota não encontrada no Mock Server',
            availableRoutes: compiledRoutes.map((r) => `${r.method} ${r.pathname}`)
          })
        );
        pushLog({ method: req.method, path: req.url, matchedItemId: null, status: 404, ms });
        return;
      }

      const picked = pickMockResponse(match.route.item, req.headers || {});
      const sendRes = () => {
        const ms = Math.round(Number(process.hrtime.bigint() - startNs) / 1e6);
        res.writeHead(picked.status, picked.headers);
        res.end(picked.body);
        pushLog({ method: req.method, path: req.url, matchedItemId: match.route.item.id, status: picked.status, ms });
      };

      if (picked.delayMs > 0) {
        setTimeout(sendRes, picked.delayMs);
      } else {
        sendRes();
      }
    });

    await new Promise((resolve, reject) => {
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          reject(new CdoError('EADDRINUSE', `Porta ${port} já está em uso.`));
        } else {
          reject(new CdoError(err.code || 'MOCK_START_ERROR', err.message));
        }
      });
      server.listen(Number(port), host, resolve);
    });

    const addr = server.address();
    currentConfig = {
      running: true,
      collectionId,
      host: addr.address,
      port: addr.port,
      url: `http://${addr.address}:${addr.port}`,
      routes: routesSummary
    };
    return currentConfig;
  }

  async function stop() {
    if (!server) return { ok: true };
    const s = server;
    server = null;
    currentConfig = null;
    s.closeAllConnections?.();
    await new Promise((resolve) => s.close(() => resolve()));
    return { ok: true };
  }

  function status() {
    return currentConfig || { running: false };
  }

  return {
    start,
    stop,
    status,
    rebuildRoutes,
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter)
  };
}

module.exports = {
  createMockServer
};
