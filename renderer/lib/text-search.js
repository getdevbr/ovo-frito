/* U-12: busca textual pura — contagem e marcação de ocorrências. UMD. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.CDO = root.CDO || {};
    root.CDO.textSearch = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Contagem case-insensitive de ocorrências não-sobrepostas.
  function countMatches(text, query) {
    if (!query) return 0;
    const hay = String(text || '').toLowerCase();
    const needle = String(query).toLowerCase();
    let n = 0, i = 0;
    while ((i = hay.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
    return n;
  }

  // HTML escapado com <mark class="res-search-hit"> em cada ocorrência.
  // Retorna { html, count }. Query vazia → texto escapado puro.
  function highlight(text, query, markClass) {
    const src = String(text || '');
    const q = String(query || '');
    const cls = markClass || 'res-search-hit';
    if (!q) return { html: escapeHtml(src), count: 0 };
    const lower = src.toLowerCase();
    const needle = q.toLowerCase();
    let out = '';
    let pos = 0;
    let count = 0;
    let idx;
    while ((idx = lower.indexOf(needle, pos)) !== -1) {
      out += escapeHtml(src.slice(pos, idx));
      out += `<mark class="${cls}">${escapeHtml(src.slice(idx, idx + needle.length))}</mark>`;
      pos = idx + needle.length;
      count++;
    }
    out += escapeHtml(src.slice(pos));
    return { html: out, count };
  }

  // Índices das ocorrências (para navegação next/prev).
  function matchIndices(text, query, max) {
    const src = String(text || '');
    const needle = String(query || '').toLowerCase();
    const idxs = [];
    if (!needle) return idxs;
    const lower = src.toLowerCase();
    let i = 0;
    const limit = max || 10000;
    while ((i = lower.indexOf(needle, i)) !== -1 && idxs.length < limit) {
      idxs.push(i);
      i += needle.length;
    }
    return idxs;
  }

  return { escapeHtml, countMatches, highlight, matchIndices };
});
