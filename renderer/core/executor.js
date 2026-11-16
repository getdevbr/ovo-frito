
/* ============================================================================
 * US-09: Avaliador de Assertions Declarativas & Captura Pós-Resposta
 * ============================================================================ */
function getByPath(obj, pathExpr) {
  if (!obj || !pathExpr) return undefined;
  const parts = String(pathExpr)
    .replace(/^json\.?/i, '')
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (p === '__proto__' || p === 'prototype' || p === 'constructor') return undefined;
    if (cur === null || cur === undefined) return undefined;
    cur = cur[p];
  }
  return cur;
}


function resolveResponseSourceValue(response, parsedJson, sourceExpr, dbContext = null) {
  const s = (sourceExpr || '').trim();
  if (s === 'status') return response?.status;
  if (s === 'timeMs') return response?.timeMs;
  if (s === 'sizeBytes') return response?.sizeBytes;
  if (s === 'body') return response?.body || '';
  if (s.toLowerCase().startsWith('header.')) {
    const hName = s.slice(7).trim().toLowerCase();
    for (const [k, v] of Object.entries(response?.headers || {})) {
      if (k.toLowerCase() === hName) return Array.isArray(v) ? v.join(', ') : String(v);
    }
    return undefined;
  }
  if (s.startsWith('dbResult.') || s.startsWith('db.')) {
    const subPath = s.startsWith('dbResult.') ? s.slice('dbResult.'.length) : s.slice('db.'.length);
    const lastDb = dbContext?.dbResult || response?.dbResult || null;
    return getByPath(lastDb, subPath);
  }
  if (s.startsWith('dbResults.')) {
    const subPath = s.slice('dbResults.'.length);
    const namedDb = dbContext?.dbResults || response?.dbResults || null;
    return getByPath(namedDb, subPath);
  }
  if (s.toLowerCase().startsWith('json.') || s.toLowerCase() === 'json') {
    return getByPath(parsedJson, s);
  }
  return getByPath(parsedJson, s);
}


function resolveDbQueryParameterValue(rawToken, response, parsedJson, dbContext) {
  if (rawToken === null || rawToken === undefined || typeof rawToken === 'number' || typeof rawToken === 'boolean') {
    return rawToken;
  }
  const str = String(rawToken).trim();
  if (!str) return '';

  // Suporte direto a response.body.<path> ou json.<path> ou response.status
  if (/^response\.body\./i.test(str)) {
    const val = getByPath(parsedJson, str.replace(/^response\.body\./i, ''));
    if (val !== undefined) return val;
  }
  if (/^json\./i.test(str)) {
    const val = getByPath(parsedJson, str.slice(5));
    if (val !== undefined) return val;
  }
  if (/^response\.status$/i.test(str)) {
    return response?.status;
  }
  if (/^(dbResult|db)\./.test(str)) {
    const val = resolveResponseSourceValue(response, parsedJson, str, dbContext);
    if (val !== undefined) return val;
  }

  // Interpola {{var}}, {{@Req.json.x}} e também {{response.body.x}}
  const interpolated = interpolateVariables(str).replace(/\{\{\s*response\.body\.([^}]+?)\s*\}\}/gi, (_m, p) => {
    const v = getByPath(parsedJson, p.trim());
    return v !== undefined && v !== null ? String(v) : '';
  });

  if (/^-?\d+(\.\d+)?$/.test(interpolated) && str.startsWith('response.')) {
    return Number(interpolated);
  }
  return interpolated;
}


function parseDbQueryParamsList(rawParams, response = null, parsedJson = null, dbContext = null) {
  if (Array.isArray(rawParams)) {
    return rawParams.map((item) => resolveDbQueryParameterValue(item, response, parsedJson, dbContext));
  }
  const text = String(rawParams ?? '').trim();
  if (!text) return [];

  // Se o usuário digitou um array JSON ou estilo JS `[response.body.id, "ativo"]`
  if (text.startsWith('[') && text.endsWith(']')) {
    try {
      const parsedArr = JSON.parse(text);
      if (Array.isArray(parsedArr)) {
        return parsedArr.map((item) => resolveDbQueryParameterValue(item, response, parsedJson, dbContext));
      }
    } catch {
      const inner = text.slice(1, -1).trim();
      if (!inner) return [];
      return inner.split(',').map((part) => {
        const clean = part.trim().replace(/^['"]|['"]$/g, '');
        return resolveDbQueryParameterValue(clean, response, parsedJson, dbContext);
      });
    }
  }

  return text.split(',').map((part) => {
    const clean = part.trim().replace(/^['"]|['"]$/g, '');
    return resolveDbQueryParameterValue(clean, response, parsedJson, dbContext);
  });
}


async function executeDeclarativeDbSteps(tab, phase = 'pre', response = null, parsedJson = null) {
  const list = phase === 'post' ? tab.postDbQueries : tab.preDbQueries;
  const steps = Array.isArray(list) ? list.filter((q) => q && q.enabled !== false && String(q.query || '').trim()) : [];
  const captureOutcomes = [];
  const assertionOutcomes = [];
  if (steps.length === 0) {
    return { dbResult: tab.dbContext?.dbResult || null, dbResults: tab.dbContext?.dbResults || {}, captures: captureOutcomes, assertions: assertionOutcomes };
  }

  if (!tab.dbContext) {
    tab.dbContext = { dbResult: null, dbResults: {}, history: [] };
  }

  const conn = typeof resolveActiveDbConnection === 'function' ? resolveActiveDbConnection() : null;
  const scriptConsole = createScriptConsoleProxy(tab, phase === 'post' ? 'Post-DB' : 'Pre-DB');

  if (!conn) {
    const msg = 'Conexão de banco de dados não configurada ou desativada no Profile atual.';
    scriptConsole.error(msg);
    assertionOutcomes.push({
      source: `DB (${phase})`,
      operator: '=>',
      target: 'Conexão ativa no Profile',
      actual: msg,
      passed: false
    });
    return { dbResult: tab.dbContext.dbResult, dbResults: tab.dbContext.dbResults, captures: captureOutcomes, assertions: assertionOutcomes };
  }

  let envUpdated = false;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepName = String(step.name || `query_${i + 1}`).trim();
    const sql = interpolateVariables(String(step.query || '').trim());
    const params = parseDbQueryParamsList(step.params, response, parsedJson, tab.dbContext);

    const res = await IPC.invoke('pm:db:query', {
      connection: conn,
      query: sql,
      params,
      timeoutMs: Number(state.settings?.timeoutMs) || 10000
    });

    const normalizedRes = {
      ok: Boolean(res?.ok),
      rows: Array.isArray(res?.rows) ? res.rows : [],
      rowCount: typeof res?.rowCount === 'number' ? res.rowCount : 0,
      fields: Array.isArray(res?.fields) ? res.fields : [],
      command: res?.command || '',
      durationMs: res?.durationMs || 0,
      error: res?.error || null
    };

    tab.dbContext.dbResult = normalizedRes;
    tab.dbContext.dbResults[stepName] = normalizedRes;
    tab.dbContext.history.push({
      phase,
      name: stepName,
      sql,
      params,
      ...normalizedRes
    });

    if (!normalizedRes.ok) {
      scriptConsole.error(`[${stepName}] Falha SQL: ${normalizedRes.error}`);
      assertionOutcomes.push({
        source: `DB Query (${stepName})`,
        operator: '=>',
        target: sql,
        actual: normalizedRes.error || 'Erro SQL',
        passed: false
      });
      continue;
    }

    scriptConsole.log(`[${stepName}] SQL OK (${normalizedRes.rowCount} row(s), ${normalizedRes.durationMs}ms): ${sql}`);

    // Capturas da query para o Profile (formato "rows.0.id -> user_id; rowCount -> total_rows" ou "rows.0.id=user_id")
    const capturesRaw = String(step.captures || '').trim();
    if (capturesRaw) {
      const pairs = capturesRaw.split(/[;\n]+/).map((s) => s.trim()).filter(Boolean);
      for (const pair of pairs) {
        const parts = pair.includes('->') ? pair.split('->') : pair.split('=');
        if (parts.length < 2) continue;
        const srcPath = parts[0].trim().replace(/^(dbResult|db)\./, '');
        const targetVarName = parts.slice(1).join('=').trim().replace(/^\{\{|\}\}$/g, '');
        if (!srcPath || !targetVarName) continue;
        const extracted = getByPath(normalizedRes, srcPath);
        if (extracted !== undefined) {
          const env = getOrInitActiveProfileForScripts();
          const strVal = typeof extracted === 'object' && extracted !== null ? JSON.stringify(extracted) : String(extracted);
          const existingVar = (env.variables || []).find((v) => v.key === targetVarName);
          if (existingVar) {
            existingVar.value = strVal;
            existingVar.enabled = true;
          } else {
            env.variables.push({ key: targetVarName, value: strVal, enabled: true, secret: false });
          }
          envUpdated = true;
          captureOutcomes.push({ source: `db.${srcPath}`, varName: targetVarName, value: strVal, ok: true });
        } else {
          captureOutcomes.push({ source: `db.${srcPath}`, varName: targetVarName, value: 'não encontrado', ok: false });
        }
      }
    }
  }

  if (envUpdated) {
    await persistStore('profiles');
    await persistStore('settings');
  }

  return {
    dbResult: tab.dbContext.dbResult,
    dbResults: tab.dbContext.dbResults,
    captures: captureOutcomes,
    assertions: assertionOutcomes
  };
}


async function evaluateAssertionsAndCaptures(tab, response) {
  let parsedJson = null;
  try {
    parsedJson = JSON.parse(response.body);
  } catch {}

  const assertionOutcomes = [];
  const captureOutcomes = [];

  // 1. Executa Queries SQL Pós-request declarativas antes de avaliar as assertions declarativas e o script pós-request
  const postDbOut = await executeDeclarativeDbSteps(tab, 'post', response, parsedJson);
  assertionOutcomes.push(...postDbOut.assertions);
  captureOutcomes.push(...postDbOut.captures);

  // 2. Executa Post-response Script (pm.test / pm.expect / pm.db.query / dbResult) se configurado
  if (tab.postResponseScript && tab.postResponseScript.trim()) {
    const scriptResults = await executePostResponseScript(tab, response, parsedJson);
    assertionOutcomes.push(...scriptResults.assertions);
    captureOutcomes.push(...scriptResults.captures);
  }

  // 3. Avalia Assertions Declarativas (suportando status, json.*, header.*, dbResult.rows.0.*, dbResult.rowCount, dbResults.<nome>.*)
  for (const a of tab.assertions || []) {
    if (!a || a.enabled === false || !a.source) continue;
    const actual = resolveResponseSourceValue(response, parsedJson, a.source, tab.dbContext);
    const op = a.operator || '==';
    const expected = interpolateVariables(String(a.target ?? ''));
    let passed = false;

    if (op === 'exists') {
      passed = actual !== undefined && actual !== null;
    } else if (op === '==') {
      passed = String(actual) === expected;
    } else if (op === '!=') {
      passed = String(actual) !== expected;
    } else if (op === '<') {
      passed = Number(actual) < Number(expected);
    } else if (op === '<=') {
      passed = Number(actual) <= Number(expected);
    } else if (op === '>') {
      passed = Number(actual) > Number(expected);
    } else if (op === 'contains') {
      passed = String(actual ?? '').toLowerCase().includes(expected.toLowerCase());
    }

    assertionOutcomes.push({
      source: a.source,
      operator: op,
      target: expected,
      actual: actual === undefined ? 'undefined' : typeof actual === 'object' ? JSON.stringify(actual) : String(actual),
      passed
    });
  }

  let envUpdated = false;
  for (const c of tab.captures || []) {
    if (!c || c.enabled === false || !c.key || !c.value) continue;
    const sourcePath = c.key.trim();
    const targetVarName = c.value.trim().replace(/^\{\{|\}\}$/g, '');
    const extracted = resolveResponseSourceValue(response, parsedJson, sourcePath, tab.dbContext);

    if (extracted !== undefined) {
      const profile = getOrInitActiveProfileForScripts();
      const strVal = typeof extracted === 'object' ? JSON.stringify(extracted) : String(extracted);
      const existingVar = profile.variables.find((v) => v.key === targetVarName);
      if (existingVar) {
        existingVar.value = strVal;
        existingVar.enabled = true;
      } else {
        profile.variables.push({ key: targetVarName, value: strVal, enabled: true, secret: /token|secret|key|pass/i.test(targetVarName) });
      }
      envUpdated = true;
      captureOutcomes.push({ source: sourcePath, varName: targetVarName, value: strVal, ok: true });
    } else {
      captureOutcomes.push({ source: sourcePath, varName: targetVarName, value: 'não encontrado', ok: false });
    }
  }

  if (envUpdated) {
    await persistStore('profiles');
    await persistStore('settings');
  }

  tab.testResults = {
    assertions: assertionOutcomes,
    captures: captureOutcomes
  };
}


function createScriptConsoleProxy(tab, phase = 'Pre-request') {
  if (!Array.isArray(tab.scriptConsoleLogs)) tab.scriptConsoleLogs = [];
  const pushLog = (level, args) => {
    const formatted = args
      .map((a) => {
        if (typeof a === 'object' && a !== null) {
          try {
            return JSON.stringify(a);
          } catch {
            return String(a);
          }
        }
        return String(a);
      })
      .join(' ');
    tab.scriptConsoleLogs.push({
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour12: false }),
      phase,
      level,
      message: formatted
    });
  };
  return {
    log: (...args) => {
      console.log(...args);
      pushLog('INFO', args);
    },
    info: (...args) => {
      console.info(...args);
      pushLog('INFO', args);
    },
    warn: (...args) => {
      console.warn(...args);
      pushLog('WARN', args);
    },
    error: (...args) => {
      console.error(...args);
      pushLog('ERROR', args);
    }
  };
}


async function executePreRequestScript(tab) {
  tab.scriptConsoleLogs = [];
  tab.dbContext = { dbResult: null, dbResults: {}, history: [] };

  // 1. Executa steps SQL declarativos pré-request (Data Seeding / Data Fetching)
  const preDbOut = await executeDeclarativeDbSteps(tab, 'pre', null, null);
  tab._preDbOutcomes = preDbOut;

  const code = (tab.preRequestScript || '').trim();
  if (!code) return;
  let envDirty = false;
  const env = getOrInitActiveProfileForScripts();
  const dbConnection = typeof resolveActiveDbConnection === 'function' ? resolveActiveDbConnection(env) : null;

  const result = await IPC.invoke('pm:script:run', {
    phase: 'pre',
    code,
    envVars: (env.variables || []).map((v) => ({ key: v.key, value: v.value, enabled: v.enabled !== false })),
    request: {},
    dbConnection,
    dbResult: tab.dbContext?.dbResult || null,
    dbResults: tab.dbContext?.dbResults || {},
    timeoutMs: 5000
  });

  const scriptConsole = createScriptConsoleProxy(tab, 'Pre-request');
  if (!result || result.ok === false) {
    scriptConsole.error(`Erro no Pre-request Script: ${(result && result.error) || 'falha no sandbox'}`);
  }
  for (const log of result?.logs || []) {
    if (log.level === 'WARN') scriptConsole.warn(log.message);
    else if (log.level === 'ERROR') scriptConsole.error(log.message);
    else scriptConsole.log(log.message);
  }
  for (const q of result?.dbQueries || []) {
    tab.dbContext.dbResult = { ok: q.ok, rows: q.rowsPreview || [], rowCount: q.rowCount || 0, durationMs: q.durationMs || 0, error: q.error || null };
    tab.dbContext.history.push(q);
  }

  for (const h of result?.headersAdded || []) {
    tab.headers.push({ key: String(h.key), value: String(h.value ?? ''), enabled: true });
  }
  for (const set of result?.envSets || []) {
    const strVal = String(set.value ?? '');
    const found = (env.variables || []).find((v) => v.key === set.key);
    if (found) {
      found.value = strVal;
      found.enabled = true;
    } else {
      env.variables.push({ key: String(set.key), value: strVal, enabled: true, secret: false });
    }
    envDirty = true;
  }

  if (envDirty) {
    await persistStore('profiles');
    await persistStore('settings');
  }
}


async function executePostResponseScript(tab, response, parsedJson) {
  const code = (tab.postResponseScript || '').trim();
  const assertions = [];
  const captures = [];
  if (!code) return { assertions, captures };

  let envDirty = false;
  const env = getOrInitActiveProfileForScripts();
  const dbConnection = typeof resolveActiveDbConnection === 'function' ? resolveActiveDbConnection(env) : null;

  const result = await IPC.invoke('pm:script:run', {
    phase: 'post',
    code,
    envVars: (env.variables || []).map((v) => ({ key: v.key, value: v.value, enabled: v.enabled !== false })),
    request: {},
    response: {
      status: response.status,
      statusText: response.statusText,
      timeMs: response.timeMs,
      headers: response.headers || {},
      body: response.body || '',
      parsedJson: parsedJson ?? null
    },
    dbConnection,
    dbResult: tab.dbContext?.dbResult || null,
    dbResults: tab.dbContext?.dbResults || {},
    timeoutMs: 5000
  });

  const scriptConsole = createScriptConsoleProxy(tab, 'Post-response');
  if (!result || result.ok === false) {
    scriptConsole.error(`Erro no Post-response Script: ${(result && result.error) || 'falha no sandbox'}`);
    assertions.push({
      source: 'Script Error',
      operator: '=>',
      target: 'Execução do Script JS',
      actual: (result && result.error) || 'falha no sandbox',
      passed: false
    });
  }
  for (const log of result?.logs || []) {
    if (log.level === 'WARN') scriptConsole.warn(log.message);
    else if (log.level === 'ERROR') scriptConsole.error(log.message);
    else scriptConsole.log(log.message);
  }
  for (const q of result?.dbQueries || []) {
    if (!tab.dbContext) tab.dbContext = { dbResult: null, dbResults: {}, history: [] };
    tab.dbContext.dbResult = { ok: q.ok, rows: q.rowsPreview || [], rowCount: q.rowCount || 0, durationMs: q.durationMs || 0, error: q.error || null };
    tab.dbContext.history.push(q);
  }

  for (const set of result?.envSets || []) {
    const strVal = String(set.value ?? '');
    const found = (env.variables || []).find((v) => v.key === set.key);
    if (found) {
      found.value = strVal;
      found.enabled = true;
    } else {
      env.variables.push({ key: String(set.key), value: strVal, enabled: true, secret: /token|secret|key|pass/i.test(set.key) });
    }
    envDirty = true;
    captures.push({ source: 'pm.environment.set', varName: String(set.key), value: strVal, ok: true });
  }

  for (const t of result?.tests || []) {
    assertions.push({
      source: 'pm.test',
      operator: '=>',
      target: t.name,
      actual: t.passed ? 'OK' : t.actual,
      passed: !!t.passed
    });
  }

  if (envDirty) {
    await persistStore('profiles');
    await persistStore('settings');
  }

  return { assertions, captures };
}


/* Execução de uma Requisição (usada tanto pelo botão Send quanto pelo Collection Runner) */
async function executeTabRequestObject(tab) {
  const latestStore = await IPC.invoke('pm:storage:loadAll');
  if (latestStore.profiles) state.profiles = latestStore.profiles;
  if (latestStore.cookies) state.cookies = latestStore.cookies;
  if (latestStore.sessions?.responseCache) {
    state.sessions.responseCache = {
      ...latestStore.sessions.responseCache,
      ...(state.sessions.responseCache || {})
    };
  }

  // 1. Executa Pre-request Script (pm.*) antes de interpolar variáveis
  await executePreRequestScript(tab);

  const resolvedUrl = interpolateVariables(tab.url || '');
  const resolvedHeaders = (tab.headers || []).map((h) => ({
    key: interpolateVariables(h.key || ''),
    value: interpolateVariables(h.value || ''),
    enabled: h.enabled !== false
  }));
  const effectiveAuth = resolveEffectiveTabAuth(tab);
  const resolvedAuth = {
    type: effectiveAuth?.type || 'none',
    inheritedFromCollection: effectiveAuth?.inheritedFromCollection || undefined,
    token: interpolateVariables(effectiveAuth?.token || ''),
    username: interpolateVariables(effectiveAuth?.username || ''),
    password: interpolateVariables(effectiveAuth?.password || ''),
    keyName: interpolateVariables(effectiveAuth?.keyName || ''),
    keyValue: interpolateVariables(effectiveAuth?.keyValue || ''),
    addTo: effectiveAuth?.addTo || 'header',
    autoRefresh: effectiveAuth?.autoRefresh === true,
    grantType: effectiveAuth?.grantType || 'client_credentials',
    tokenUrl: interpolateVariables(effectiveAuth?.tokenUrl || ''),
    clientId: interpolateVariables(effectiveAuth?.clientId || ''),
    clientSecret: interpolateVariables(effectiveAuth?.clientSecret || ''),
    authorizationUrl: interpolateVariables(effectiveAuth?.authorizationUrl || ''),
    scopes: interpolateVariables(effectiveAuth?.scopes || ''),
    redirectPort: effectiveAuth?.redirectPort || '',
    accessKey: interpolateVariables(effectiveAuth?.accessKey || ''),
    secretKey: interpolateVariables(effectiveAuth?.secretKey || ''),
    region: effectiveAuth?.region || 'us-east-1',
    service: effectiveAuth?.service || 'execute-api',
    sessionToken: interpolateVariables(effectiveAuth?.sessionToken || '')
  };

  let effectiveBodyMode = tab.body?.mode || 'none';
  let effectiveRaw = interpolateVariables(tab.body?.raw || '');
  if (effectiveBodyMode === 'graphql') {
    const gqlQuery = interpolateVariables(tab.body?.graphqlQuery || '');
    const gqlVarsRaw = interpolateVariables(tab.body?.graphqlVars || '{}');
    let parsedVars = {};
    try {
      parsedVars = JSON.parse(gqlVarsRaw);
    } catch {
      parsedVars = gqlVarsRaw;
    }
    effectiveBodyMode = 'json';
    effectiveRaw = JSON.stringify({ query: gqlQuery, variables: parsedVars }, null, 2);
  }

  const resolvedBody = {
    mode: effectiveBodyMode,
    raw: effectiveRaw,
    urlencoded: (tab.body?.urlencoded || []).map((u) => ({
      key: interpolateVariables(u.key || ''),
      value: interpolateVariables(u.value || ''),
      enabled: u.enabled !== false
    })),
    formdata: (tab.body?.formdata || []).map((f) => ({
      ...f,
      key: interpolateVariables(f.key || ''),
      value: interpolateVariables(f.value || '')
    }))
  };

  const netSettings = ensureNetworkSettings();
  const resolvedNetwork = {
    ignoreCertErrors: Boolean(netSettings.ignoreCertErrors),
    proxy: {
      enabled: Boolean(netSettings.proxy?.enabled),
      protocol: netSettings.proxy?.protocol || 'http',
      host: interpolateVariables(netSettings.proxy?.host || ''),
      port: interpolateVariables(String(netSettings.proxy?.port || '8080')),
      username: interpolateVariables(netSettings.proxy?.username || ''),
      password: interpolateVariables(netSettings.proxy?.password || ''),
      bypass: interpolateVariables(netSettings.proxy?.bypass || 'localhost, 127.0.0.1, ::1')
    },
    mtls: {
      enabled: Boolean(netSettings.mtls?.enabled),
      fileName: netSettings.mtls?.fileName || '',
      certBase64: netSettings.mtls?.certBase64 || '',
      passphrase: interpolateVariables(netSettings.mtls?.passphrase || '')
    }
  };

  tab.lastSentInspector = {
    timestamp: new Date().toISOString(),
    method: tab.method,
    resolvedUrl,
    network: {
      ignoreCertErrors: resolvedNetwork.ignoreCertErrors,
      proxy: resolvedNetwork.proxy.enabled && resolvedNetwork.proxy.host
        ? `${resolvedNetwork.proxy.protocol}://${resolvedNetwork.proxy.host}:${resolvedNetwork.proxy.port}`
        : 'direct'
    },
    resolvedHeaders: resolvedHeaders.filter((h) => h.enabled !== false && h.key),
    resolvedAuth: resolvedAuth.type !== 'none' ? resolvedAuth : undefined,
    resolvedBody: effectiveBodyMode !== 'none' ? resolvedBody : undefined
  };

  // U-11: variáveis {{...}} não resolvidas — avisa (ou bloqueia se configurado). Só na aba ativa da UI.
  const isActiveUiTab = tab === getActiveTab();
  const unresolved = isActiveUiTab && window.CDO?.varResolution?.findUnresolved
    ? window.CDO.varResolution.findUnresolved(tab, (k) => { try { return isVariableDefined(k); } catch { return false; } })
    : [];
  if (unresolved.length > 0) {
    const keys = [...new Set(unresolved.map((u) => u.key))];
    const msg = `Variáveis não resolvidas: ${keys.join(', ')}`;
    if (state.settings?.blockUnresolvedVars) {
      const statusMsg = document.getElementById('statusMessage');
      if (statusMsg) statusMsg.textContent = `Envio bloqueado — ${msg}`;
      window.CDO?.toast?.show?.({ message: msg, type: 'warning', action: { label: 'Revisar', run: () => document.getElementById('reqUrl')?.focus() } });
      tab.loading = false;
      renderAll();
      return null;
    }
    window.CDO?.toast?.show?.({
      message: `${msg} — serão enviadas literalmente`,
      type: 'warning',
      durationMs: 8000,
      action: { label: 'Revisar', run: () => document.getElementById('reqUrl')?.focus() }
    });
  }

  const requestSpec = {
    method: tab.method,
    url: resolvedUrl,
    headers: resolvedHeaders,
    auth: resolvedAuth,
    body: resolvedBody,
    timeoutMs: Number(state.settings.timeoutMs) || 30000,
    network: resolvedNetwork
  };
  emitAppHook('request:beforeSend', { tab, spec: requestSpec });
  let response = await IPC.invoke('pm:runtime:request', requestSpec);

  if (
    response &&
    response.ok === false &&
    response.error &&
    response.error.code === 'VAULT_LOCKED' &&
    typeof window.CDO?.vault?.requestUnlock === 'function'
  ) {
    const unlocked = await window.CDO.vault.requestUnlock().catch(() => false);
    if (unlocked) {
      response = await IPC.invoke('pm:runtime:request', requestSpec);
    }
  }

  tab.response = response;

  if (response.ok) {
    if (!state.sessions.responseCache) state.sessions.responseCache = {};
    const reqKey = (tab.name || tab.url || tab.id).trim();
    const cacheEntry = {
      name: reqKey,
      method: tab.method,
      url: tab.url,
      timestamp: new Date().toISOString(),
      response
    };
    state.sessions.responseCache[reqKey] = cacheEntry;
    state.sessions.responseCache.__last = cacheEntry;

    // Limita o cache usado para request chaining (@Req) — evita crescimento ilimitado em disco/memória
    const cacheKeys = Object.keys(state.sessions.responseCache).filter((k) => k !== '__last');
    if (cacheKeys.length > 100) {
      const pruned = {};
      for (const k of cacheKeys.slice(-100)) pruned[k] = state.sessions.responseCache[k];
      pruned.__last = cacheEntry;
      state.sessions.responseCache = pruned;
    }

    if (Array.isArray(response.cookies) && response.cookies.length > 0) {
      const fresh = await IPC.invoke('pm:storage:loadAll');
      if (fresh.cookies) state.cookies = fresh.cookies;
    }

    await evaluateAssertionsAndCaptures(tab, response);
    if (tab._preDbOutcomes) {
      tab.testResults.assertions.unshift(...(tab._preDbOutcomes.assertions || []));
      tab.testResults.captures.unshift(...(tab._preDbOutcomes.captures || []));
    }
  }

  // Registra no Histórico Individual desta Requisição
  if (!Array.isArray(tab.history)) tab.history = [];
  tab.history.unshift({
    id: uid('hist'),
    timestamp: new Date().toISOString(),
    name: tab.name || tab.url,
    method: tab.method,
    url: tab.url,
    resolvedUrl,
    status: response.status,
    statusText: response.statusText || '',
    timeMs: response.timeMs || 0,
    sizeBytes: response.sizeBytes || 0,
    params: structuredClone(tab.params || []),
    headers: structuredClone(tab.headers || []),
    auth: structuredClone(tab.auth || {}),
    body: structuredClone(tab.body || {}),
    response: structuredClone(response),
    testResults: tab.testResults ? structuredClone(tab.testResults) : null,
    requestSent: tab.lastSentInspector ? structuredClone(tab.lastSentInspector) : null
  });
  if (tab.history.length > 30) tab.history.length = 30;

  await syncTabBackToCollectionItem(tab);
  await saveSessionState();
  emitAppHook('request:completed', { tab, response });

  return response;
}


async function sendActiveRequest() {
  const tab = getActiveTab();
  if (!tab || tab.loading) return;

  const method = (tab.method || 'GET').toUpperCase();
  const env = getActiveProfile();
  if (isActiveProfileProduction(env)) {
    const meta = getProfileMeta(env);
    const ctxName = meta.label || env.name || 'Profile';
    const resolvedUrl = interpolateVariables(tab.url || '');
    const msg = `🚨 PRODUÇÃO ATIVA em ${ctxName}\n\nDeseja realmente enviar ${method} para:\n${resolvedUrl} ?`;
    const confirmed = window.CDO?.dialog?.confirm
      ? await window.CDO.dialog.confirm({ title: 'Enviar em Produção', message: msg, confirmLabel: 'Enviar em PROD', danger: true })
      : window.confirm(msg);
    if (!confirmed) {
      document.getElementById('statusMessage').textContent = `Envio de ${method} cancelado — ambiente de Produção.`;
      return;
    }
  } else if (isActiveProfileConfirmDestructive(env) && ['DELETE', 'PUT', 'PATCH', 'POST'].includes(method)) {
    const meta = getProfileMeta(env);
    const ctxName = meta.label || env.name || 'Profile';
    const resolvedUrl = interpolateVariables(tab.url || '');
    const confirmed = window.confirm(
      `🛡️ Trava Anti-Acidente Ativa em ${ctxName}\n\nDeseja realmente enviar a requisição ${method} para:\n${resolvedUrl} ?`
    );
    if (!confirmed) {
      document.getElementById('statusMessage').textContent = `Envio de ${method} cancelado pela trava de segurança do Profile.`;
      return;
    }
  }

  tab.loading = true;
  renderActiveRequest();

  const statusMsg = document.getElementById('statusMessage');
  statusMsg.textContent = `Enviando ${tab.method} ${interpolateVariables(tab.url || '')}...`;

  const response = await executeTabRequestObject(tab);
  tab.loading = false;

  statusMsg.textContent = response.ok
    ? `Concluído: ${response.status} ${response.statusText} (${response.timeMs} ms) — Salvo no histórico individual da requisição`
    : `Erro: ${(response.error && (response.error.message || response.error)) || response.statusText}`;

  renderAll();
}

(function (root) {
  const api = {
    getByPath,
    resolveResponseSourceValue,
    resolveDbQueryParameterValue,
    parseDbQueryParamsList,
    executeDeclarativeDbSteps,
    evaluateAssertionsAndCaptures,
    createScriptConsoleProxy,
    executePreRequestScript,
    executePostResponseScript,
    executeTabRequestObject,
    sendActiveRequest
  };
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.core = root.CDO.core || {};
    root.CDO.core.executor = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

