'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createStorage } = require('./storage');
const { createCookieJar } = require('./cookie-jar');
const { createHttpEngine } = require('./http-engine');
const { createVault } = require('./vault');
const { createOAuthTokenManager } = require('./oauth-token-manager');
const { createDbEngine } = require('./db-engine');
const { runUserScriptAsync } = require('./script-sandbox');
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
    preDbQueries: Array.isArray(r.preDbQueries) ? r.preDbQueries : [],
    postDbQueries: Array.isArray(r.postDbQueries) ? r.postDbQueries : [],
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

function createCliRunner({ dataDir, variables = {}, database = null, dbEngine: externalDbEngine = null, timeoutMs = 30000, vaultPassword = null } = {}) {
  const resolvedDataDir = dataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'ovo-frito-cli-'));
  const storage = createStorage({ dataDir: resolvedDataDir });
  storage.ensurePortableDataDir();
  const cookieJar = createCookieJar(storage);
  const vault = createVault({ storage });
  if (vaultPassword) {
    const unlockRes = vault.unlock(vaultPassword);
    if (!unlockRes.ok) {
      throw new Error(`Falha ao desbloquear o cofre: ${unlockRes.error || 'master password incorreta'}`);
    }
  }
  const httpEngine = createHttpEngine({ storage, cookieJar, vault });
  const oauthTokenManager = createOAuthTokenManager({ httpEngine, vault });
  httpEngine.setOAuthTokenManager(oauthTokenManager);
  const dbEngine = externalDbEngine || createDbEngine({ dataDir: resolvedDataDir });

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
        autoRefresh: item.auth?.autoRefresh === true,
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

  function resolveDbParamValue(rawParam, { vars = {}, response = null, parsedJson = null, dbContext = null } = {}) {
    if (rawParam === null || rawParam === undefined) return null;
    if (typeof rawParam === 'number' || typeof rawParam === 'boolean') return rawParam;
    const expr = String(rawParam).trim();
    if (!expr) return '';

    if (expr.startsWith('response.body.')) {
      const subPath = expr.slice('response.body.'.length).replace(/\[(\d+)\]/g, '.$1');
      return getByPath(parsedJson, subPath);
    }
    if (expr === 'response.status') return response?.status;
    if (expr.startsWith('json.') || expr.startsWith('header.') || expr === 'status' || expr === 'body') {
      return resolveResponseSourceValue(response || {}, parsedJson, expr, dbContext);
    }
    if (expr.startsWith('dbResult.') || expr.startsWith('dbResults.')) {
      return resolveResponseSourceValue(response || {}, parsedJson, expr, dbContext);
    }

    const interpolated = interpolate(expr, vars);
    if (/^-?\d+(\.\d+)?$/.test(interpolated) && expr.startsWith('{{') && expr.endsWith('}}')) {
      return Number(interpolated);
    }
    return interpolated;
  }

  function parseDbParams(rawParams, ctx) {
    if (Array.isArray(rawParams)) {
      return rawParams.map((p) => resolveDbParamValue(p, ctx));
    }
    const trimmed = String(rawParams || '').trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsedArr = JSON.parse(trimmed);
        if (Array.isArray(parsedArr)) {
          return parsedArr.map((p) => resolveDbParamValue(p, ctx));
        }
      } catch {
        const inner = trimmed.slice(1, -1).trim();
        if (!inner) return [];
        return inner
          .split(',')
          .map((token) => token.trim().replace(/^['"]|['"]$/g, ''))
          .map((token) => resolveDbParamValue(token, ctx));
      }
    }
    return trimmed
      .split(',')
      .map((token) => token.trim().replace(/^['"]|['"]$/g, ''))
      .map((token) => resolveDbParamValue(token, ctx));
  }

  function applyDeclarativeCaptures(capturesRaw, res, varsObj) {
    if (!capturesRaw) return;
    const entries = [];
    if (Array.isArray(capturesRaw)) {
      for (const c of capturesRaw) {
        if (c && c.enabled !== false && (c.source || c.key) && (c.target || c.value)) {
          entries.push({ path: String(c.source || c.key).trim(), varName: String(c.target || c.value).trim() });
        }
      }
    } else if (typeof capturesRaw === 'string') {
      const parts = capturesRaw.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
      for (const p of parts) {
        const arrowIdx = p.indexOf('->');
        const eqIdx = p.indexOf('=');
        if (arrowIdx !== -1) {
          entries.push({ path: p.slice(0, arrowIdx).trim(), varName: p.slice(arrowIdx + 2).trim() });
        } else if (eqIdx !== -1) {
          entries.push({ varName: p.slice(0, eqIdx).trim(), path: p.slice(eqIdx + 1).trim() });
        }
      }
    }
    for (const { path: rawPath, varName } of entries) {
      if (!rawPath || !varName) continue;
      const normalized = rawPath.replace(/^dbResult\./, '').replace(/\[(\d+)\]/g, '.$1');
      const val = getByPath(res, normalized);
      if (val !== undefined) {
        varsObj[varName] = typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val);
      }
    }
  }

  async function executeDeclarativeQueries(steps, { conn, vars, response = null, parsedJson = null, dbContext }) {
    for (const step of steps || []) {
      if (!step || step.enabled === false || !String(step.query || '').trim()) continue;
      if (!conn || conn.enabled === false) {
        throw new Error('Conexão de banco de dados não configurada para executar query SQL.');
      }
      const sqlText = interpolate(step.query, vars);
      const params = parseDbParams(step.params, { vars, response, parsedJson, dbContext });
      const res = await dbEngine.executeQuery({ connection: conn, query: sqlText, params, timeoutMs });
      if (!res || !res.ok) {
        throw new Error(res?.error || 'Falha ao executar query SQL.');
      }
      const normalized = {
        rows: Array.isArray(res.rows) ? res.rows : [],
        rowCount: Number(res.rowCount ?? (Array.isArray(res.rows) ? res.rows.length : 0)),
        fields: Array.isArray(res.fields) ? res.fields : [],
        command: res.command || 'SQL',
        lastInsertRowid: res.lastInsertRowid ?? null,
        durationMs: res.durationMs || 0
      };
      dbContext.dbResult = normalized;
      dbContext.results.push(normalized);
      if (step.name && String(step.name).trim()) {
        dbContext.dbResults[String(step.name).trim()] = normalized;
      }
      applyDeclarativeCaptures(step.captures, normalized, vars);
    }
  }

  async function runRequests(requests, { vars = {}, database: runDb = null, stopOnFailure = false } = {}) {
    const runtimeVars = { ...variables, ...vars };
    const activeDb = runDb || database;
    const results = [];
    for (const item of requests || []) {
      if (item.__loadError) {
        results.push({ name: item.name, ok: false, error: item.__loadError, status: 0, assertions: [] });
        if (stopOnFailure) break;
        continue;
      }

      const dbContext = { dbResult: null, dbResults: {}, results: [] };
      let preError = null;

      try {
        if (Array.isArray(item.preDbQueries) && item.preDbQueries.length > 0) {
          await executeDeclarativeQueries(item.preDbQueries, {
            conn: activeDb,
            vars: runtimeVars,
            dbContext
          });
        }
        if (item.preRequestScript && item.preRequestScript.trim()) {
          const preScriptRes = await runUserScriptAsync({
            code: item.preRequestScript,
            phase: 'pre',
            envVars: runtimeVars,
            request: { method: item.method || 'GET', url: item.url || '', headers: item.headers || [], body: item.body?.raw || '' },
            dbExecutor: activeDb
              ? (sql, params) => dbEngine.executeQuery({ connection: activeDb, query: sql, params, timeoutMs })
              : null,
            dbResult: dbContext.dbResult,
            dbResults: dbContext.dbResults
          });
          if (Array.isArray(preScriptRes.envSets)) {
            for (const s of preScriptRes.envSets) {
              if (s && s.key) runtimeVars[s.key] = s.value;
            }
          }
          if (Array.isArray(preScriptRes.dbQueries) && preScriptRes.dbQueries.length > 0) {
            const lastQ = preScriptRes.dbQueries[preScriptRes.dbQueries.length - 1];
            if (lastQ && lastQ.ok) {
              dbContext.dbResult = { rows: lastQ.rowsPreview || [], rowCount: lastQ.rowCount || 0 };
            }
          }
          if (preScriptRes.error) preError = preScriptRes.error;
        }
      } catch (err) {
        preError = err.message || String(err);
      }

      if (preError) {
        results.push({ name: item.name || item.url, method: item.method || 'GET', url: item.url, status: 0, ok: false, error: preError, assertions: [] });
        if (stopOnFailure) break;
        continue;
      }

      const spec = buildSpec(item, runtimeVars);
      const response = await httpEngine.executeHttpRequest(spec);
      let parsed = null;
      try {
        parsed = JSON.parse(response.body || '');
      } catch {}

      let postError = null;
      const scriptAssertions = [];
      try {
        if (Array.isArray(item.postDbQueries) && item.postDbQueries.length > 0) {
          await executeDeclarativeQueries(item.postDbQueries, {
            conn: activeDb,
            vars: runtimeVars,
            response,
            parsedJson: parsed,
            dbContext
          });
        }
        if (item.postResponseScript && item.postResponseScript.trim()) {
          const postScriptRes = await runUserScriptAsync({
            code: item.postResponseScript,
            phase: 'post',
            envVars: runtimeVars,
            request: { method: spec.method, url: spec.url, headers: spec.headers, body: spec.body?.raw || '' },
            response,
            dbExecutor: activeDb
              ? (sql, params) => dbEngine.executeQuery({ connection: activeDb, query: sql, params, timeoutMs })
              : null,
            dbResult: dbContext.dbResult,
            dbResults: dbContext.dbResults
          });
          if (Array.isArray(postScriptRes.envSets)) {
            for (const s of postScriptRes.envSets) {
              if (s && s.key) runtimeVars[s.key] = s.value;
            }
          }
          if (Array.isArray(postScriptRes.tests)) {
            for (const t of postScriptRes.tests) {
              scriptAssertions.push({
                source: `[pm.test] ${t.name}`,
                operator: 'script',
                target: 'pass',
                actual: t.passed ? 'OK' : t.actual || 'Falhou',
                passed: Boolean(t.passed)
              });
            }
          }
          if (postScriptRes.error) postError = postScriptRes.error;
        }
      } catch (err) {
        postError = err.message || String(err);
      }

      for (const cap of item.captures || []) {
        if (!cap || cap.enabled === false || !cap.key || !cap.value) continue;
        const val = resolveResponseSourceValue(response, parsed, cap.key, dbContext);
        if (val !== undefined) {
          runtimeVars[cap.value.trim()] = typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val);
        }
      }

      const declarativeAssertions = evaluateAssertions(item.assertions || [], response, parsed, dbContext);
      const assertions = [...declarativeAssertions, ...scriptAssertions];
      if (postError) {
        assertions.push({
          source: '[Post-request / DB Error]',
          operator: 'error',
          target: 'sem erros',
          actual: postError,
          passed: false
        });
      }
      const allPassed = response.ok && !postError && assertions.every((a) => a.passed);
      const record = {
        name: item.name || item.url,
        method: spec.method,
        url: spec.url,
        status: response.status,
        ok: Boolean(response.ok && response.status >= 200 && response.status < 400 && allPassed),
        timeMs: response.timeMs,
        error: response.error || postError || null,
        assertions,
        dbResult: dbContext.dbResult
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
    storage,
    vault,
    oauthTokenManager
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
