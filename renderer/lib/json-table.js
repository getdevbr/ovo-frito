(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.jsonTable = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function flattenObject(obj, prefix = '', depth = 0, maxDepth = 1, out = {}) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
    for (const key of Object.keys(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      const val = obj[key];
      if (val !== null && typeof val === 'object' && !Array.isArray(val) && depth < maxDepth) {
        flattenObject(val, fullKey, depth + 1, maxDepth, out);
      } else if (val !== null && typeof val === 'object') {
        out[fullKey] = JSON.stringify(val);
      } else {
        out[fullKey] = val;
      }
    }
    return out;
  }

  function isArrayOfObjects(value) {
    return Array.isArray(value) && value.length > 0 && value.every((item) => item !== null && typeof item === 'object' && !Array.isArray(item));
  }

  function toTable(value, { maxDepth = 1 } = {}) {
    if (!isArrayOfObjects(value)) {
      return { ok: false, columns: [], rows: [] };
    }
    const colSet = new Set();
    const flatRows = value.map((item) => {
      const flat = flattenObject(item, '', 0, maxDepth, {});
      for (const k of Object.keys(flat)) colSet.add(k);
      return flat;
    });
    const columns = Array.from(colSet);
    const rows = flatRows.map((flat) => columns.map((c) => (flat[c] === undefined ? '' : flat[c])));
    return { ok: true, columns, rows };
  }

  function sortRows(rows, colIdx, direction = 'asc') {
    const dir = direction === 'desc' ? -1 : 1;
    return rows
      .map((row, idx) => ({ row, idx }))
      .sort((a, b) => {
        const va = a.row[colIdx];
        const vb = b.row[colIdx];
        if (typeof va === 'number' && typeof vb === 'number') {
          return va === vb ? a.idx - b.idx : (va - vb) * dir;
        }
        const sa = String(va ?? '');
        const sb = String(vb ?? '');
        const cmp = sa.localeCompare(sb, 'pt-BR', { numeric: true });
        return cmp !== 0 ? cmp * dir : a.idx - b.idx;
      })
      .map((entry) => entry.row);
  }

  return {
    isArrayOfObjects,
    toTable,
    sortRows
  };
});
