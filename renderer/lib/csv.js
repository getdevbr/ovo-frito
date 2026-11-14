(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.csv = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function escapeCell(val, delimiter) {
    const str = val === null || val === undefined ? '' : String(val);
    if (str.includes('"') || str.includes('\n') || str.includes('\r') || str.includes(delimiter)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  function toCsv(columns, rows, { delimiter = ';', bom = true } = {}) {
    const header = columns.map((c) => escapeCell(c, delimiter)).join(delimiter);
    const lines = rows.map((r) => r.map((cell) => escapeCell(cell, delimiter)).join(delimiter));
    const content = [header, ...lines].join('\r\n');
    return bom ? `\uFEFF${content}` : content;
  }

  return {
    escapeCell,
    toCsv
  };
});
