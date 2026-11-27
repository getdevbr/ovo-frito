'use strict';

const http = require('node:http');
const { EventEmitter } = require('node:events');
const { compileRoutes, matchRoute } = require('../../renderer/lib/route-matcher');
const { interpolateString } = require('../../renderer/lib/interpolate');
const { GENERATOR_MAP } = require('../../renderer/lib/generators-br');
const { CdoError } = require('../errors');

function flattenTemplateVars(prefix, obj, out) {
  if (obj === null || obj === undefined) return;
  if (typeof obj !== 'object') {
    out[prefix] = String(obj);
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    const key = `${prefix}.${k}`;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      flattenTemplateVars(key, v, out);
    } else if (v !== undefined) {
      out[key] = Array.isArray(v) ? JSON.stringify(v) : String(v);
    }
  }
}

function matchMockRule(rules, reqHeaders, queryObj) {
  if (!Array.isArray(rules) || rules.length === 0) return null;
  for (const rule of rules) {
    if (!rule || typeof rule !== 'object') continue;
    let ok = true;
    if (rule.header) {
      const hv = reqHeaders[String(rule.header).toLowerCase()];
      if (hv === undefined || (rule.headerValue !== undefined && String(hv) !== String(rule.headerValue))) {
        ok = false;
      }
    }
    if (ok && rule.query) {
      const qv = queryObj[rule.query];
      if (qv === undefined || (rule.queryValue !== undefined && String(qv) !== String(rule.queryValue))) {
        ok = false;
      }
    }
    if (ok) return rule;
  }
  return null;
}

function pickMockResponse(item, reqHeaders, reqCtx = {}, serverOpts = {}) {
  const examples = Array.isArray(item.mockExamples) ? item.mockExamples : [];
  const requestedName = reqHeaders['x-mock-example'];
  let chosen = null;

  if (requestedName) {
    chosen = examples.find((e) => e.name === requestedName) || null;
  }
  if (!chosen) {
    chosen = examples.find((e) => e.isDefault) || examples[0] || null;
  }

  const rule = matchMockRule(chosen?.rules || item.mockRules, reqHeaders, reqCtx.query || {});

  let status = rule?.status ?? chosen?.status ?? item.history?.[0]?.status ?? 200;
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

  const delayMs = Math.max(
    0,
    Number(reqHeaders['x-mock-delay'] ?? rule?.delayMs ?? chosen?.delayMs ?? serverOpts.delayMs) || 0
  );

  // Taxa de erro simulada (FUT-09)
  const errorRate = Number(reqHeaders['x-mock-error-rate'] ?? chosen?.errorRate ?? serverOpts.errorRate ?? 0);
  if (errorRate > 0 && Math.random() * 100 < errorRate) {
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ error: 'Erro simulado pelo Mock Server dinâmico', errorRate }),
      delayMs
    };
  }

  const variables = {};
  if (reqCtx.params) flattenTemplateVars('request.params', reqCtx.params, variables);
  if (reqCtx.query) flattenTemplateVars('request.query', reqCtx.query, variables);
  if (reqHeaders) flattenTemplateVars('request.headers', reqHeaders, variables);
  if (reqCtx.body && typeof reqCtx.body === 'object') flattenTemplateVars('request.body', reqCtx.body, variables);
  if (reqCtx.method) variables['request.method'] = reqCtx.method;
  if (reqCtx.pathname) variables['request.path'] = reqCtx.pathname;

  const rawBody = rule?.body ?? chosen?.body ?? item.history?.[0]?.responseBody ?? JSON.stringify({ mock: true, item: item.name });
  const body = interpolateString(String(rawBody), { variables, generators: GENERATOR_MAP });

  return { status, headers, body, delayMs };
}

const ALLOWED_BIND_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

function createMockServer({ storage, onLog } = {}) {
  const emitter = new EventEmitter();
  let server = null;
  let compiledRoutes = [];
  let currentConfig = null;
  const logs = [];
  const statefulStores = new Map();
  let statefulSeq = 1;

  function handleStatefulCrud(method, pathname, parsedBody) {
    const segs = pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    if (segs.length === 0) return null;
    const isItemRoute = segs.length >= 2;
    const resource = isItemRoute ? `/${segs.slice(0, -1).join('/')}` : `/${segs.join('/')}`;
    const id = isItemRoute ? segs[segs.length - 1] : null;
    if (!statefulStores.has(resource)) statefulStores.set(resource, new Map());
    const store = statefulStores.get(resource);

    if (method === 'POST' && !isItemRoute) {
      const item = parsedBody && typeof parsedBody === 'object' ? { ...parsedBody } : {};
      if (item.id === undefined) item.id = String(statefulSeq++);
      store.set(String(item.id), item);
      return { status: 201, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(item), delayMs: 0 };
    }
    if (method === 'GET' && !isItemRoute && store.size > 0) {
      return { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(Array.from(store.values())), delayMs: 0 };
    }
    if (method === 'GET' && isItemRoute && store.has(id)) {
      return { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(store.get(id)), delayMs: 0 };
    }
    if ((method === 'PUT' || method === 'PATCH') && isItemRoute) {
      if (!store.has(id)) return { status: 404, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ error: 'Not found' }), delayMs: 0 };
      const updated = { ...store.get(id), ...(parsedBody && typeof parsedBody === 'object' ? parsedBody : {}), id };
      store.set(id, updated);
      return { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(updated), delayMs: 0 };
    }
    if (method === 'DELETE' && isItemRoute) {
      if (!store.has(id)) return { status: 404, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ error: 'Not found' }), delayMs: 0 };
      store.delete(id);
      return { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ deleted: true, id }), delayMs: 0 };
    }
    return null;
  }

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

  async function start({ collectionId, port = 4000, host = '127.0.0.1', cors = true, variables = {}, errorRate = 0, delayMs = 0, stateful = false }) {
    if (server) {
      await stop();
    }
    statefulStores.clear();
    statefulSeq = 1;
    if (!ALLOWED_BIND_HOSTS.has(String(host))) {
      throw new CdoError('INVALID_HOST', `Host de bind não permitido: ${host}. Use 127.0.0.1/localhost/::1.`);
    }
    const routesSummary = rebuildRoutes(collectionId, variables);
    const serverOpts = { errorRate: Number(errorRate) || 0, delayMs: Number(delayMs) || 0, stateful: Boolean(stateful) };

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

      const chunks = [];
      let bodyBytes = 0;
      req.on('data', (c) => {
        if (bodyBytes < 1048576) {
          chunks.push(c);
          bodyBytes += c.length;
        }
      });
      req.on('end', () => {
        let parsedBody = null;
        if (chunks.length > 0) {
          const rawStr = Buffer.concat(chunks).toString('utf8');
          try { parsedBody = JSON.parse(rawStr); } catch { parsedBody = rawStr; }
        }
        const parsedReqUrl = new URL(req.url || '/', 'http://127.0.0.1');
        const queryObj = Object.fromEntries(parsedReqUrl.searchParams.entries());
        const match = matchRoute(compiledRoutes, req.method, req.url || '/');

        if (serverOpts.stateful && (!match || match.route.item.mockStateful !== false)) {
          const crudRes = handleStatefulCrud(req.method, parsedReqUrl.pathname, parsedBody);
          if (crudRes) {
            const ms = Math.round(Number(process.hrtime.bigint() - startNs) / 1e6);
            const sendCrud = () => {
              res.writeHead(crudRes.status, crudRes.headers);
              res.end(crudRes.body);
              pushLog({ method: req.method, path: req.url, matchedItemId: match?.route?.item?.id || 'stateful', status: crudRes.status, ms });
            };
            if (serverOpts.delayMs > 0) setTimeout(sendCrud, serverOpts.delayMs);
            else sendCrud();
            return;
          }
        }

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

        const picked = pickMockResponse(
          match.route.item,
          req.headers || {},
          { params: match.params, query: queryObj, body: parsedBody, method: req.method, pathname: parsedReqUrl.pathname },
          serverOpts
        );
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
