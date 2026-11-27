(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.pathVars = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function stripQueryAndHash(url) {
    return String(url || '').split('?')[0].split('#')[0];
  }

  function extractPathVarKeys(url) {
    const base = stripQueryAndHash(url);
    // Ignora scheme/host (ex: http://localhost:3000) pegando só a partir do pathname
    const withoutScheme = base.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/]*/, '');
    const keys = [];
    const seen = new Set();
    const re = /(?:\/:([A-Za-z_][A-Za-z0-9_]*)|(?<!\{)\{([A-Za-z_][A-Za-z0-9_]*)\}(?!\}))/g;
    let m;
    while ((m = re.exec(withoutScheme)) !== null) {
      const k = m[1] || m[2];
      if (k && !seen.has(k)) {
        seen.add(k);
        keys.push(k);
      }
    }
    return keys;
  }

  function syncPathVars(url, existing = []) {
    const keys = extractPathVarKeys(url);
    const byKey = new Map();
    for (const row of Array.isArray(existing) ? existing : []) {
      if (row && row.key) byKey.set(row.key, row);
    }
    return keys.map((key) => {
      const prev = byKey.get(key);
      return {
        key,
        value: prev ? String(prev.value ?? '') : '',
        description: prev ? String(prev.description ?? '') : ''
      };
    });
  }

  function applyPathVars(url, pathVars = [], interpolateFn = (v) => v) {
    const str = String(url || '');
    if (!str || !Array.isArray(pathVars) || pathVars.length === 0) return str;
    const map = new Map();
    for (const pv of pathVars) {
      if (pv && pv.key && pv.value !== undefined && pv.value !== '') {
        map.set(pv.key, String(interpolateFn(String(pv.value))));
      }
    }
    if (map.size === 0) return str;
    const qIdx = str.indexOf('?');
    const base = qIdx === -1 ? str : str.slice(0, qIdx);
    const suffix = qIdx === -1 ? '' : str.slice(qIdx);
    const schemeMatch = base.match(/^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/]*|\{\{[^}]+\}\})(.*)$/);
    const prefix = schemeMatch ? schemeMatch[1] : '';
    let pathPart = schemeMatch ? schemeMatch[2] : base;
    for (const [k, val] of map.entries()) {
      const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const enc = encodeURIComponent(val);
      pathPart = pathPart
        .replace(new RegExp(`\\/:${escaped}(?=/|$)`, 'g'), `/${enc}`)
        .replace(new RegExp(`(?<!\\{)\\{${escaped}\\}(?!\\})`, 'g'), enc);
    }
    return `${prefix}${pathPart}${suffix}`;
  }

  return { extractPathVarKeys, syncPathVars, applyPathVars };
});
