
/* ============================================================================
 * US-09: Avaliador de Assertions Declarativas & Captura Pós-Resposta
 * ============================================================================ */
function getByPath(obj, pathExpr) {
  if (!obj || !pathExpr) return undefined;
  const parts = pathExpr
    .replace(/^json\.?/i, '')
    .split('.')
    .filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[p];
  }
  return cur;
}


function resolveResponseSourceValue(response, parsedJson, sourceExpr) {
  const s = (sourceExpr || '').trim();
  if (s === 'status') return response.status;
  if (s === 'timeMs') return response.timeMs;
  if (s === 'sizeBytes') return response.sizeBytes;
  if (s === 'body') return response.body || '';
  if (s.toLowerCase().startsWith('header.')) {
    const hName = s.slice(7).trim().toLowerCase();
    for (const [k, v] of Object.entries(response.headers || {})) {
      if (k.toLowerCase() === hName) return Array.isArray(v) ? v.join(', ') : String(v);
    }
    return undefined;
  }
  if (s.toLowerCase().startsWith('json.') || s.toLowerCase() === 'json') {
    return getByPath(parsedJson, s);
  }
  return getByPath(parsedJson, s);
}


async function evaluateAssertionsAndCaptures(tab, response) {
  let parsedJson = null;
  try {
    parsedJson = JSON.parse(response.body);
  } catch {}

  const assertionOutcomes = [];
  for (const a of tab.assertions || []) {
    if (!a || a.enabled === false || !a.source) continue;
    const actual = resolveResponseSourceValue(response, parsedJson, a.source);
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

  const captureOutcomes = [];
  let envUpdated = false;
  for (const c of tab.captures || []) {
    if (!c || c.enabled === false || !c.key || !c.value) continue;
    const sourcePath = c.key.trim();
    const targetVarName = c.value.trim().replace(/^\{\{|\}\}$/g, '');
    const extracted = resolveResponseSourceValue(response, parsedJson, sourcePath);

    if (extracted !== undefined) {
      let env = getActiveEnvironment();
      if (!env) {
        if (state.environments.length === 0) {
          env = { id: uid('env'), name: 'Default Environment', variables: [] };
          state.environments.push(env);
        } else {
          env = state.environments[0];
        }
        state.settings.activeEnvironmentId = env.id;
      }
      const strVal = typeof extracted === 'object' ? JSON.stringify(extracted) : String(extracted);
      const existingVar = env.variables.find((v) => v.key === targetVarName);
      if (existingVar) {
        existingVar.value = strVal;
        existingVar.enabled = true;
      } else {
        env.variables.push({ key: targetVarName, value: strVal, enabled: true, secret: /token|secret|key|pass/i.test(targetVarName) });
      }
      envUpdated = true;
      captureOutcomes.push({ source: sourcePath, varName: targetVarName, value: strVal, ok: true });
    } else {
      captureOutcomes.push({ source: sourcePath, varName: targetVarName, value: 'não encontrado', ok: false });
    }
  }

  if (envUpdated) {
    await persistStore('environments');
    await persistStore('settings');
  }

  // Executa Post-response Script (pm.test / pm.expect / pm.environment.set) se configurado
  if (tab.postResponseScript && tab.postResponseScript.trim()) {
    const scriptResults = await executePostResponseScript(tab, response, parsedJson);
    assertionOutcomes.push(...scriptResults.assertions);
    captureOutcomes.push(...scriptResults.captures);
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
  const code = (tab.preRequestScript || '').trim();
  if (!code) return;
  let envDirty = false;
  const env = getOrInitActiveEnvForScripts();

  const result = await IPC.invoke('pm:script:run', {
    phase: 'pre',
    code,
    envVars: (env.variables || []).map((v) => ({ key: v.key, value: v.value, enabled: v.enabled !== false })),
    request: {},
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
    await persistStore('environments');
    await persistStore('settings');
  }
}


async function executePostResponseScript(tab, response, parsedJson) {
  const code = (tab.postResponseScript || '').trim();
  const assertions = [];
  const captures = [];
  if (!code) return { assertions, captures };

  let envDirty = false;
  const env = getOrInitActiveEnvForScripts();

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
    await persistStore('environments');
    await persistStore('settings');
  }

  return { assertions, captures };
}


/* Execução de uma Requisição (usada tanto pelo botão Send quanto pelo Collection Runner) */
async function executeTabRequestObject(tab) {
  const latestStore = await IPC.invoke('pm:storage:loadAll');
  if (latestStore.environments) state.environments = latestStore.environments;
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
  const response = await IPC.invoke('pm:runtime:request', requestSpec);

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
  const env = getActiveEnvironment();
  if (isActiveProfileConfirmDestructive(env) && ['DELETE', 'PUT', 'PATCH', 'POST'].includes(method)) {
    const meta = getEnvProfileMeta(env);
    const ctxName = meta.label ? `Profile "${meta.label}" (${env.name})` : `Environment "${env.name}"`;
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
    : `Erro: ${response.error || response.statusText}`;

  renderAll();
}

(function (root) {
  const api = {
    getByPath,
    resolveResponseSourceValue,
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

