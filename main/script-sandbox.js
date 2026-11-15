'use strict';

/**
 * Sandbox isolado (node:vm) para execução de Pre-request e Post-response scripts.
 * Substitui `new Function` no contexto da janela: o código do usuário roda sem
 * acesso a `process`, `require`, `window`, `globalThis` do main ou do renderer,
 * com timeout e sem geração dinâmica de código interna (ASVS 5.0 1.3.2).
 */
const vm = require('node:vm');

function createChaiLikeExpect(actual) {
  const check = (cond, msg) => {
    if (!cond) throw new Error(msg);
  };
  const api = {
    to: {
      equal(expected) {
        check(actual === expected, `esperado ${JSON.stringify(expected)}, obtido ${JSON.stringify(actual)}`);
      },
      eql(expected) {
        check(
          JSON.stringify(actual) === JSON.stringify(expected),
          `esperado ${JSON.stringify(expected)}, obtido ${JSON.stringify(actual)}`
        );
      },
      include(sub) {
        check(String(actual ?? '').includes(String(sub)), `"${actual}" não inclui "${sub}"`);
      },
      get exist() {
        check(actual !== undefined && actual !== null, `valor é ${actual}`);
        return true;
      },
      be: {
        get ok() {
          check(!!actual, `valor não é truthy (${actual})`);
          return true;
        },
        get true() {
          check(actual === true, `esperado true, obtido ${JSON.stringify(actual)}`);
          return true;
        },
        get false() {
          check(actual === false, `esperado false, obtido ${JSON.stringify(actual)}`);
          return true;
        },
        above(n) {
          check(Number(actual) > Number(n), `esperado > ${n}, obtido ${actual}`);
        },
        below(n) {
          check(Number(actual) < Number(n), `esperado < ${n}, obtido ${actual}`);
        },
        a(type) {
          const actualType = Array.isArray(actual) ? 'array' : typeof actual;
          check(actualType === String(type).toLowerCase(), `esperado tipo ${type}, obtido ${actualType}`);
        }
      }
    }
  };
  return api;
}

function serializeForSandbox(value, depth = 0) {
  if (depth > 6) return null;
  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return value;
  if (t === 'function') return undefined;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((v) => serializeForSandbox(v, depth + 1));
  if (t === 'object') {
    const out = {};
    for (const k of Object.keys(value)) {
      if (k === '__proto__' || k === 'prototype' || k === 'constructor') continue;
      out[k] = serializeForSandbox(value[k], depth + 1);
    }
    return out;
  }
  return String(value);
}

function buildSandboxEnv({ phase = 'pre', envVars = [], request = {}, response = null, dbResult = null, dbResults = {}, dbExecutor = null }) {
  const result = {
    ok: false,
    error: null,
    logs: [],
    envSets: [],
    headersAdded: [],
    tests: [],
    dbQueries: []
  };

  const envStore = new Map();
  if (Array.isArray(envVars)) {
    for (const v of envVars) {
      if (v && v.enabled !== false && typeof v.key === 'string') {
        envStore.set(v.key, String(v.value ?? ''));
      }
    }
  } else if (envVars && typeof envVars === 'object') {
    for (const [k, val] of Object.entries(envVars)) {
      envStore.set(String(k), String(val ?? ''));
    }
  }

  const envApi = {
    get(key) {
      return envStore.has(String(key)) ? envStore.get(String(key)) : undefined;
    },
    set(key, value) {
      const strVal = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '');
      envStore.set(String(key), strVal);
      result.envSets.push({ key: String(key), value: strVal });
    }
  };

  const requestApi = {
    headers: {
      add(h) {
        if (h && h.key) {
          result.headersAdded.push({ key: String(h.key), value: String(h.value ?? '') });
        }
      }
    },
    get data() {
      return serializeForSandbox(request?.data ?? {});
    }
  };

  const parsedResponseBody = (() => {
    if (!response) return null;
    if (response.parsedJson !== undefined && response.parsedJson !== null) return serializeForSandbox(response.parsedJson);
    try {
      return serializeForSandbox(JSON.parse(response.body || 'null'));
    } catch {
      return response.body || null;
    }
  })();

  const responseApi = response
    ? {
        code: response.status,
        status: response.status,
        statusText: response.statusText,
        responseTime: response.timeMs,
        headers: serializeForSandbox(response.headers || {}),
        body: parsedResponseBody,
        text: () => String(response.body || ''),
        json: () => {
          if (response.parsedJson !== undefined && response.parsedJson !== null) return serializeForSandbox(response.parsedJson);
          return serializeForSandbox(JSON.parse(response.body || 'null'));
        },
        to: {
          have: {
            status(expectedCode) {
              if (response.status !== expectedCode) {
                throw new Error(`esperado status ${expectedCode}, obtido ${response.status}`);
              }
            },
            header(hName) {
              const exists = Object.keys(response.headers || {}).some(
                (k) => k.toLowerCase() === String(hName).toLowerCase()
              );
              if (!exists) throw new Error(`header "${hName}" ausente`);
            }
          },
          be: {
            get ok() {
              if (response.status < 200 || response.status >= 300) {
                throw new Error(`status ${response.status} não é 2xx`);
              }
              return true;
            }
          }
        }
      }
    : null;

  const safeLastDbResult = serializeForSandbox(
    dbResult || { rows: [], rowCount: 0, fields: [] }
  );
  const safeNamedDbResults = serializeForSandbox(dbResults || {});

  const dbApi = {
    get lastResult() {
      return safeLastDbResult;
    },
    get results() {
      return safeNamedDbResults;
    },
    async query(sql, params = []) {
      if (typeof dbExecutor !== 'function') {
        throw new Error('Executor de banco de dados não disponível ou nenhuma conexão ativa configurada no Environment.');
      }
      const safeSql = String(sql || '');
      const safeParams = Array.isArray(params) ? serializeForSandbox(params) : [];
      const queryOut = await dbExecutor(safeSql, safeParams);
      const sanitized = serializeForSandbox({
        ok: Boolean(queryOut?.ok),
        rows: Array.isArray(queryOut?.rows) ? queryOut.rows : [],
        rowCount: typeof queryOut?.rowCount === 'number' ? queryOut.rowCount : 0,
        fields: Array.isArray(queryOut?.fields) ? queryOut.fields : [],
        command: queryOut?.command || '',
        durationMs: queryOut?.durationMs || 0,
        error: queryOut?.error || null
      });
      result.dbQueries.push({
        phase,
        sql: safeSql,
        params: safeParams,
        ok: sanitized.ok,
        rowCount: sanitized.rowCount,
        durationMs: sanitized.durationMs,
        error: sanitized.error,
        rowsPreview: (sanitized.rows || []).slice(0, 20)
      });
      if (!sanitized.ok) {
        throw new Error(sanitized.error || 'Falha ao executar query SQL');
      }
      return sanitized;
    }
  };

  const pendingTests = [];

  const pm = {
    environment: envApi,
    variables: envApi,
    globals: envApi,
    collectionVariables: envApi,
    request: requestApi,
    response: responseApi,
    db: Object.freeze(dbApi),
    expect: (val) => createChaiLikeExpect(val),
    test(testName, fn) {
      try {
        const ret = fn();
        if (ret && typeof ret.then === 'function') {
          const p = Promise.resolve(ret).then(
            () => {
              result.tests.push({ name: String(testName), passed: true, actual: 'OK' });
            },
            (err) => {
              result.tests.push({ name: String(testName), passed: false, actual: err && err.message ? err.message : String(err) });
            }
          );
          pendingTests.push(p);
        } else {
          result.tests.push({ name: String(testName), passed: true, actual: 'OK' });
        }
      } catch (err) {
        result.tests.push({ name: String(testName), passed: false, actual: err.message });
      }
    }
  };

  const consoleApi = {
    log: (...args) => result.logs.push({ level: 'INFO', message: args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ') }),
    info: (...args) => result.logs.push({ level: 'INFO', message: args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ') }),
    warn: (...args) => result.logs.push({ level: 'WARN', message: args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ') }),
    error: (...args) => result.logs.push({ level: 'ERROR', message: args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ') }),
    debug: (...args) => result.logs.push({ level: 'INFO', message: args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ') })
  };

  const sandbox = Object.freeze({
    pm: Object.freeze(pm),
    console: Object.freeze(consoleApi),
    response: responseApi ? Object.freeze(responseApi) : null,
    dbResult: Object.freeze(safeLastDbResult),
    dbResults: Object.freeze(safeNamedDbResults)
  });

  return { result, sandbox, pendingTests };
}

function runUserScript({ code, phase = 'pre', envVars = [], request = {}, response = null, dbResult = null, dbResults = {}, timeoutMs = 2000 } = {}) {
  const { result, sandbox } = buildSandboxEnv({ phase, envVars, request, response, dbResult, dbResults });

  if (!code || typeof code !== 'string') {
    result.ok = true;
    return result;
  }

  let context;
  try {
    context = vm.createContext(sandbox, {
      codeGeneration: { strings: false, wasm: false }
    });
    vm.runInContext(code, context, {
      timeout: Math.max(100, Math.min(30000, Number(timeoutMs) || 2000)),
      microtaskMode: 'afterEvaluate'
    });
    result.ok = true;
  } catch (err) {
    result.ok = false;
    result.error = err && err.message ? err.message : String(err);
    result.logs.push({ level: 'ERROR', message: `Erro no ${phase === 'post' ? 'Post-response' : 'Pre-request'} Script: ${result.error}` });
  }

  return result;
}

async function runUserScriptAsync({
  code,
  phase = 'pre',
  envVars = [],
  request = {},
  response = null,
  dbResult = null,
  dbResults = {},
  dbExecutor = null,
  timeoutMs = 5000
} = {}) {
  const hasAsync = typeof code === 'string' && (/\bawait\b/.test(code) || /\bpm\.db\.query\b/.test(code));
  if (!hasAsync && typeof dbExecutor !== 'function') {
    return runUserScript({ code, phase, envVars, request, response, dbResult, dbResults, timeoutMs });
  }

  const { result, sandbox, pendingTests } = buildSandboxEnv({
    phase,
    envVars,
    request,
    response,
    dbResult,
    dbResults,
    dbExecutor
  });

  if (!code || typeof code !== 'string') {
    result.ok = true;
    return result;
  }

  const effectiveTimeout = Math.max(100, Math.min(30000, Number(timeoutMs) || 5000));
  let timer = null;
  try {
    const context = vm.createContext(sandbox, {
      codeGeneration: { strings: false, wasm: false }
    });
    const wrappedCode = hasAsync ? `(async () => {\n${code}\n})()` : code;
    const ret = vm.runInContext(wrappedCode, context, {
      timeout: effectiveTimeout
    });
    if (ret && typeof ret.then === 'function') {
      await Promise.race([
        ret,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`Script async excedeu o tempo limite de ${effectiveTimeout}ms`)), effectiveTimeout);
        })
      ]);
    }
    if (pendingTests.length > 0) {
      await Promise.all(pendingTests);
    }
    result.ok = true;
  } catch (err) {
    result.ok = false;
    result.error = err && err.message ? err.message : String(err);
    result.logs.push({ level: 'ERROR', message: `Erro no ${phase === 'post' ? 'Post-response' : 'Pre-request'} Script: ${result.error}` });
  } finally {
    if (timer) clearTimeout(timer);
  }

  return result;
}

module.exports = { runUserScript, runUserScriptAsync, createChaiLikeExpect };
