/* U-07: filtro de histórico — puro, UMD. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.CDO = root.CDO || {};
    root.CDO.historySearch = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Casa termo contra método, url, resolvedUrl, status e timestamp.
  function entryHaystack(entry) {
    return `${entry?.method || ''} ${entry?.url || ''} ${entry?.resolvedUrl || ''} ${entry?.status ?? ''} ${entry?.timestamp || ''}`.toLowerCase();
  }

  function matches(entry, term) {
    const t = String(term || '').trim().toLowerCase();
    if (!t) return true;
    return entryHaystack(entry).includes(t);
  }

  // Filtra itens [{entry}] preservando ordem; ordena por timestamp desc se pedido.
  function filter(items, term, { newestFirst = false } = {}) {
    const out = (items || []).filter((it) => matches(it.entry ?? it, term));
    if (newestFirst) {
      out.sort((a, b) => String((b.entry ?? b).timestamp || '').localeCompare(String((a.entry ?? a).timestamp || '')));
    }
    return out;
  }

  return { entryHaystack, matches, filter };
});
