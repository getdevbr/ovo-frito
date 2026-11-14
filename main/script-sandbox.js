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

function runUserScript({ code, phase = 'pre', envVars = [], request = {}, response = null, timeoutMs = 2000 } = {}) {
  const result = {
    ok: false,
    error: null,
    logs: [],
    envSets: [],
    headersAdded: [],
    tests: []
  };

  if (!code || typeof code !== 'string') {
    result.ok = true;
    return result;
  }

  const envStore = new Map();
  for (const v of envVars || []) {
    if (v && v.enabled !== false && typeof v.key === 'string') {
      envStore.set(v.key, String(v.value ?? ''));
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

  const responseApi = response
    ? {
        code: response.status,
        status: response.statusText,
        responseTime: response.timeMs,
        headers: serializeForSandbox(response.headers || {}),
        text: () => String(response.body || ''),
        json: () => {
          if (response.parsedJson !== undefined && response.parsedJson !== null) return response.parsedJson;
          return JSON.parse(response.body || 'null');
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

  const pm = {
    environment: envApi,
    variables: envApi,
    globals: envApi,
    collectionVariables: envApi,
    request: requestApi,
    response: responseApi,
    expect: (val) => createChaiLikeExpect(val),
    test(testName, fn) {
      try {
        fn();
        result.tests.push({ name: String(testName), passed: true, actual: 'OK' });
      } catch (err) {
        result.tests.push({ name: String(testName), passed: false, actual: err.message });
      }
    }
  };

  const consoleApi = {
    log: (...args) => result.logs.push({ level: 'INFO', message: args.map(String).join(' ') }),
    info: (...args) => result.logs.push({ level: 'INFO', message: args.map(String).join(' ') }),
    warn: (...args) => result.logs.push({ level: 'WARN', message: args.map(String).join(' ') }),
    error: (...args) => result.logs.push({ level: 'ERROR', message: args.map(String).join(' ') }),
    debug: (...args) => result.logs.push({ level: 'INFO', message: args.map(String).join(' ') })
  };

  const sandbox = Object.freeze({
    pm: Object.freeze(pm),
    console: Object.freeze(consoleApi)
  });

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

module.exports = { runUserScript, createChaiLikeExpect };
