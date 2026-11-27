(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.jsonDiff = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function parseIgnoreSet(ignorePaths) {
    if (!ignorePaths) return new Set();
    if (Array.isArray(ignorePaths)) {
      return new Set(ignorePaths.map((s) => String(s || '').trim()).filter(Boolean));
    }
    return new Set(
      String(ignorePaths)
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    );
  }

  function isIgnored(pathStr, ignoreSet) {
    if (!pathStr || ignoreSet.size === 0) return false;
    if (ignoreSet.has(pathStr)) return true;
    const lastSeg = pathStr.split('.').pop()?.replace(/\[\d+\]$/, '');
    return Boolean(lastSeg && ignoreSet.has(lastSeg));
  }

  function diffJson(a, b, { ignorePaths = [] } = {}) {
    const ignoreSet = parseIgnoreSet(ignorePaths);
    const changes = [];

    function walk(va, vb, pathStr) {
      if (isIgnored(pathStr, ignoreSet)) return;
      if (va === vb) return;

      if (va === undefined) {
        changes.push({ type: 'added', path: pathStr || '$', before: undefined, after: vb });
        return;
      }
      if (vb === undefined) {
        changes.push({ type: 'removed', path: pathStr || '$', before: va, after: undefined });
        return;
      }
      if (va === null || vb === null || typeof va !== 'object' || typeof vb !== 'object') {
        changes.push({ type: 'changed', path: pathStr || '$', before: va, after: vb });
        return;
      }
      if (Array.isArray(va) !== Array.isArray(vb)) {
        changes.push({ type: 'changed', path: pathStr || '$', before: va, after: vb });
        return;
      }
      if (Array.isArray(va)) {
        const len = Math.max(va.length, vb.length);
        for (let i = 0; i < len; i++) {
          const nextPath = `${pathStr}[${i}]`;
          if (i >= va.length) walk(undefined, vb[i], nextPath);
          else if (i >= vb.length) walk(va[i], undefined, nextPath);
          else walk(va[i], vb[i], nextPath);
        }
        return;
      }

      const keys = new Set([...Object.keys(va), ...Object.keys(vb)]);
      for (const k of keys) {
        const nextPath = pathStr ? `${pathStr}.${k}` : k;
        walk(va[k], vb[k], nextPath);
      }
    }

    walk(a, b, '');
    return changes;
  }

  return { diffJson, parseIgnoreSet };
});
