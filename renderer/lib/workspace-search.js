(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.workspaceSearch = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function parseQuery(rawQuery) {
    const tokens = String(rawQuery || '').trim().split(/\s+/).filter(Boolean);
    let methodFilter = '';
    let scopeFilter = '';
    const terms = [];

    for (const t of tokens) {
      const lower = t.toLowerCase();
      if (lower.startsWith('method:')) {
        methodFilter = lower.slice(7).toUpperCase();
      } else if (lower.startsWith('in:')) {
        scopeFilter = lower.slice(3);
      } else {
        terms.push(lower);
      }
    }
    return { methodFilter, scopeFilter, terms };
  }

  function extractItemFields(item) {
    const name = String(item.name || '');
    const folder = String(item.folder || '');
    const url = String(item.url || '');
    const headers = (item.headers || [])
      .map((h) => `${h?.key || ''}: ${h?.value || ''}`)
      .join(' ');
    const body = [
      item.body?.raw || '',
      item.body?.graphqlQuery || '',
      item.body?.graphqlVars || '',
      (item.body?.urlencoded || []).map((u) => `${u?.key || ''}=${u?.value || ''}`).join(' ')
    ].join(' ');
    const scripts = `${item.preRequestScript || ''} ${item.postResponseScript || ''}`;
    return { name, folder, url, headers, body, scripts };
  }

  function searchCollections(collections, rawQuery, { limit = 50 } = {}) {
    const { methodFilter, scopeFilter, terms } = parseQuery(rawQuery);
    const results = [];

    for (const col of collections || []) {
      for (const item of col.items || []) {
        const method = String(item.method || 'GET').toUpperCase();
        if (methodFilter && method !== methodFilter) continue;

        const fields = extractItemFields(item);
        const matchedIn = [];

        if (terms.length > 0) {
          let haystack = '';
          if (scopeFilter === 'url') haystack = fields.url;
          else if (scopeFilter === 'headers') haystack = fields.headers;
          else if (scopeFilter === 'body') haystack = fields.body;
          else if (scopeFilter === 'scripts') haystack = fields.scripts;
          else if (scopeFilter === 'name') haystack = `${fields.name} ${fields.folder}`;
          else haystack = `${fields.name} ${fields.folder} ${fields.url} ${fields.headers} ${fields.body} ${fields.scripts}`;

          const hayLower = haystack.toLowerCase();
          if (!terms.every((t) => hayLower.includes(t))) continue;

          for (const [k, v] of Object.entries(fields)) {
            if (terms.some((t) => v.toLowerCase().includes(t))) matchedIn.push(k);
          }
        }

        results.push({
          collectionId: col.id,
          collectionName: col.name,
          item,
          matchedIn
        });
        if (results.length >= limit) return results;
      }
    }
    return results;
  }

  return { parseQuery, searchCollections };
});
