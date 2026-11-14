(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.interpolate = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function getByPath(obj, pathExpr) {
    if (!obj || !pathExpr) return undefined;
    const parts = String(pathExpr).replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
    let current = obj;
    for (const part of parts) {
      if (current == null || typeof current !== 'object') return undefined;
      current = current[part];
    }
    return current;
  }

  function interpolateString(str, { variables = {}, resolveChainRef = null, generators = null, now = Date.now, rng = Math.random } = {}) {
    if (typeof str !== 'string') return str;
    return str.replace(/\{\{([^}]+)\}\}/g, (match, rawKey) => {
      const key = String(rawKey).trim();

      if (key === '$timestamp') return String(Math.floor(now() / 1000));
      if (key === '$isoDate') return new Date(now()).toISOString();
      if (generators && typeof generators[key] === 'function') {
        return String(generators[key](rng));
      }

      if (key.startsWith('@') && typeof resolveChainRef === 'function') {
        const resolved = resolveChainRef(key);
        if (resolved !== undefined) return String(resolved);
      }

      if (Object.prototype.hasOwnProperty.call(variables, key)) {
        return String(variables[key]);
      }

      return match;
    });
  }

  return {
    getByPath,
    interpolateString
  };
});
