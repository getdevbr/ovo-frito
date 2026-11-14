(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.assertions = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

  function getByPath(obj, pathExpr) {
    if (!obj || !pathExpr) return undefined;
    const parts = String(pathExpr).replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
    let current = obj;
    for (const part of parts) {
      if (UNSAFE_KEYS.has(String(part))) return undefined;
      if (current == null || typeof current !== 'object') return undefined;
      current = current[part];
    }
    return current;
  }

  function resolveResponseSourceValue(response, parsedJson, sourceExpr) {
    const src = String(sourceExpr || '').trim();
    if (src === 'status') return response?.status;
    if (src === 'timeMs') return response?.timeMs;
    if (src === 'body') return response?.body;
    if (src.startsWith('header.')) {
      const hName = src.slice('header.'.length).toLowerCase();
      const headers = response?.headers || {};
      const matchKey = Object.keys(headers).find((k) => k.toLowerCase() === hName);
      return matchKey ? headers[matchKey] : undefined;
    }
    if (src.startsWith('json.')) {
      return getByPath(parsedJson, src.slice('json.'.length));
    }
    return undefined;
  }

  function evaluateAssertions(assertions, response, parsedJson) {
    const results = [];
    for (const rule of assertions || []) {
      if (!rule || rule.enabled === false) continue;
      const actual = resolveResponseSourceValue(response, parsedJson, rule.source);
      const target = rule.target;
      let passed = false;

      switch (rule.operator) {
        case '==':
          passed = String(actual) === String(target);
          break;
        case '!=':
          passed = String(actual) !== String(target);
          break;
        case 'contains':
          passed = actual !== undefined && String(actual).includes(String(target));
          break;
        case 'exists':
          passed = actual !== undefined && actual !== null && actual !== '';
          break;
        case '>':
          passed = Number(actual) > Number(target);
          break;
        case '<':
          passed = Number(actual) < Number(target);
          break;
        default:
          passed = false;
      }

      results.push({
        source: rule.source,
        operator: rule.operator,
        target,
        actual: actual === undefined ? 'undefined' : typeof actual === 'object' ? JSON.stringify(actual) : String(actual),
        passed
      });
    }
    return results;
  }

  return {
    resolveResponseSourceValue,
    evaluateAssertions
  };
});
