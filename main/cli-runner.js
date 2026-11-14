'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createStorage } = require('./storage');
const { createCookieJar } = require('./cookie-jar');
const { createHttpEngine } = require('./http-engine');
const ovoSerializer = require('../renderer/lib/serializers/ovo');
const { interpolateString, getByPath } = require('../renderer/lib/interpolate');
const { GENERATOR_MAP } = require('../renderer/lib/generators-br');
const { evaluateAssertions, resolveResponseSourceValue } = require('../renderer/lib/assertions');

function isOvoFile(filePath) {
  return path.extname(filePath).toLowerCase() === '.ovo';
}

function normalizeRequest(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    id: r.id,
    name: r.name || 'Sem Nome',
    folder: r.folder || '',
    method: r.method || 'GET',
    url: r.url || '',
    params: Array.isArray(r.params) ? r.params : [],
    headers: Array.isArray(r.headers) ? r.headers : [],
    auth: r.auth || { type: 'none' },
    body: r.body || { mode: 'none' },
    assertions: Array.isArray(r.assertions) ? r.assertions : [],
    captures: Array.isArray(r.captures) ? r.captures : [],
    preRequestScript: r.preRequestScript || '',
    postResponseScript: r.postResponseScript || ''
  };
}

function parseOvoDocument(rawText) {
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    parsed = null;
  }
  if (parsed?.type === 'request' && parsed.request) return { type: 'request', request: normalizeRequest(parsed.request) };
  if (parsed?.type === 'collection' && parsed.collection) return { type: 'collection', collection: parsed.collection };
  return { type: 'request', request: ovoSerializer.parseRequest(rawText) };
}

function loadRequests(targetPath) {
  const resolved = path.resolve(targetPath);
  const stat = fs.statSync(resolved);
  if (stat.isFile()) {
    if (!isOvoFile(resolved)) {
      throw new Error('O CLI aceita apenas arquivos .ovo ou pastas com collection.ovo + requests .ovo.');
    }
    const doc = parseOvoDocument(fs.readFileSync(resolved, 'utf8'));
    if (doc.type === 'collection') {
      const items = Array.isArray(doc.collection?.items) ? doc.collection.items.map(normalizeRequest) : [];
      return { requests: items, collection: { variables: doc.collection?.variables || [] } };
    }
    return { requests: [doc.request], collection: null };
  }

  const metaPath = path.join(resolved, 'collection.ovo');
  let collection = null;
  if (fs.existsSync(metaPath)) {
    const metaRaw = fs.readFileSync(metaPath, 'utf8');
    let metaObj = null;
    try { metaObj = JSON.parse(metaRaw); } catch {}
    if (metaObj?.type === 'collection' && metaObj.collection) {
      collection = { variables: Array.isArray(metaObj.collection.variables) ? metaObj.collection.variables : [] };
    } else {
      collection = ovoSerializer.parseCollectionMeta(metaRaw);
    }
  }
  const files = fs
    .readdirSync(resolved, { withFileTypes: true })
    .filter((d) => d.isFile() && isOvoFile(d.name) && d.name !== 'collection.ovo')
    .map((d) => path.join(resolved, d.name))
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const requests = [];
  for (const file of files) {
    try {
      const doc = parseOvoDocument(fs.readFileSync(file, 'utf8'));
      if (doc.type === 'collection') {
        requests.push(...(doc.collection?.items || []).map(normalizeRequest));
      } else {
        requests.push(doc.request);
      }
    } catch (err) {
      requests.push({ id: path.basename(file, '.ovo'), name: path.basename(file, '.ovo'), __loadError: err.message });
    }
  }
  return { requests, collection };
}

function createCliRunner({ dataDir, variables = {}, timeoutMs = 30000 } = {}) {
  const resolvedDataDir = dataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'ovo-frito-cli-'));
  const storage = createStorage({ dataDir: resolvedDataDir });
  storage.ensurePortableDataDir();
  const cookieJar = createCookieJar(storage);
  const httpEngine = createHttpEngine({ storage, cookieJar });

  const responseCache = new Map();
  let lastResponse = null;

  function variableMap(extra = {}) {
    const map = {};
    for (const [k, v] of Object.entries(variables)) map[k] = v;
    for (const [k, v] of Object.entries(extra)) map[k] = v;
    return map;
  }

  function resolveChainRef(refExpr) {
    const expr = String(refExpr || '').trim();
    if (!expr) return undefined;
    const dotIdx = expr.indexOf('.');
    if (dotIdx === -1) return undefined;
    const reqRef = expr.slice(0, dotIdx).trim();
    const fieldExpr = expr.slice(dotIdx + 1).trim();
    const target =
      reqRef.toLowerCase() === 'last'
        ? lastResponse
        : Array.from(responseCache.values()).find((r) => String(r.name || '').toLowerCase() === reqRef.toLowerCase()) ||
          Array.from(responseCache.values()).find((r) => String(r.name || '').toLowerCase().includes(reqRef.toLowerCase()));
    if (!target) return undefined;
    let parsed = null;
    try {
      parsed = JSON.parse(target.body || '');
    } catch {}
    return resolveResponseSourceValue(target, parsed, fieldExpr);
  }

  function interpolate(value, vars) {
    return interpolateString(String(value ?? ''), {
      variables: variableMap(vars),
      generators: GENERATOR_MAP,
      resolveChainRef
    });
  }

  function buildSpec(item, vars = {}) {
    const headers = (item.headers || [])
      .filter((h) => h && h.enabled !== false && h.key)
      .map((h) => ({ key: interpolate(h.key, vars), value: interpolate(h.value, vars), enabled: true }));
    const body = item.body || {};
    let bodySpec = { mode: 'none' };
    if (body.mode === 'graphql') {
      bodySpec = {
        mode: 'graphql',
        graphqlQuery: interpolate(body.graphqlQuery || '', vars),
        graphqlVars: interpolate(body.graphqlVars || '{}', vars)
      };
    } else if (body.mode === 'json' || body.mode === 'raw') {
      bodySpec = { mode: body.mode === 'json' ? 'json' : 'raw', raw: interpolate(body.raw || '', vars) };
    } else if (body.mode === 'urlencoded') {
      bodySpec = {
        mode: 'urlencoded',
        urlencoded: (body.urlencoded || []).map((u) => ({ key: interpolate(u.key, vars), value: interpolate(u.value, vars), enabled: u.enabled !== false }))
      };
    } else if (body.mode === 'formdata') {
      bodySpec = {
        mode: 'formdata',
        formdata: (body.formdata || []).map((f) => ({ ...f, key: interpolate(f.key, vars), value: interpolate(f.value, vars) }))
      };
    }

    return {
      method: item.method || 'GET',
      url: interpolate(item.url || '', vars),
      headers,
      auth: {
        type: item.auth?.type || 'none',
        token: interpolate(item.auth?.token || '', vars),
        username: interpolate(item.auth?.username || '', vars),
        password: interpolate(item.auth?.password || '', vars),
        keyName: interpolate(item.auth?.keyName || '', vars),
        keyValue: interpolate(item.auth?.keyValue || '', vars),
        addTo: item.auth?.addTo || 'header',
        grantType: item.auth?.grantType || 'client_credentials',
        tokenUrl: interpolate(item.auth?.tokenUrl || '', vars),
        clientId: interpolate(item.auth?.clientId || '', vars),
        clientSecret: interpolate(item.auth?.clientSecret || '', vars),
        accessKey: interpolate(item.auth?.accessKey || '', vars),
        secretKey: interpolate(item.auth?.secretKey || '', vars),
        region: item.auth?.region || 'us-east-1',
        service: item.auth?.service || 'execute-api',
        sessionToken: interpolate(item.auth?.sessionToken || '', vars)
      },
      body: bodySpec,
      timeoutMs
    };
  }

  async function runRequests(requests, { vars = {}, stopOnFailure = false } = {}) {
    const results = [];
    for (const item of requests || []) {
      if (item.__loadError) {
        results.push({ name: item.name, ok: false, error: item.__loadError, status: 0, assertions: [] });
        if (stopOnFailure) break;
        continue;
      }
      const spec = buildSpec(item, vars);
      const response = await httpEngine.executeHttpRequest(spec);
      let parsed = null;
      try {
        parsed = JSON.parse(response.body || '');
      } catch {}
      const assertions = evaluateAssertions(item.assertions || [], response, parsed);
      const allPassed = response.ok && assertions.every((a) => a.passed);
      const record = {
        name: item.name || item.url,
        method: spec.method,
        url: spec.url,
        status: response.status,
        ok: Boolean(response.ok && response.status >= 200 && response.status < 400 && allPassed),
        timeMs: response.timeMs,
        error: response.error || null,
        assertions
      };
      results.push(record);
      responseCache.set(String(item.name || item.id || record.url).toLowerCase(), { name: item.name || record.url, body: response.body });
      lastResponse = { name: item.name || record.url, body: response.body };
      if (stopOnFailure && !record.ok) break;
    }
    return results;
  }

  async function runFile(targetPath, options = {}) {
    const { requests, collection } = loadRequests(targetPath);
    const collectionVars = {};
    for (const v of collection?.variables || []) {
      if (v && v.enabled !== false && v.key && !v.secret) collectionVars[v.key] = v.value ?? '';
    }
    return runRequests(requests, { ...options, vars: { ...collectionVars, ...(options.vars || {}) } });
  }

  return {
    runFile,
    runRequests,
    loadRequests,
    interpolate,
    storage
  };
}

function toJUnit(results, suiteName = 'ovo-frito') {
  const cases = results
    .map((r) => {
      const name = `${r.method || 'REQ'} ${r.name || r.url || ''}`.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      if (r.ok) return `    <testcase classname="${suiteName}" name="${name}" time="${((r.timeMs || 0) / 1000).toFixed(3)}" />`;
      const msg = (r.error || r.assertions?.find((a) => !a.passed)?.actual || 'failed').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      return `    <testcase classname="${suiteName}" name="${name}" time="${((r.timeMs || 0) / 1000).toFixed(3)}"><failure message="${msg}">${msg}</failure></testcase>`;
    })
    .join('\n');
  const failures = results.filter((r) => !r.ok).length;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="${suiteName}" tests="${results.length}" failures="${failures}">\n${cases}\n</testsuite>\n`;
}

module.exports = {
  createCliRunner,
  loadRequests,
  toJUnit
};
