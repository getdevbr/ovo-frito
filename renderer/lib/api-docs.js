(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.apiDocs = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeMdCell(value) {
    return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  }

  function requestPath(item) {
    const folder = String(item.folder || '').trim();
    return folder ? `${folder} / ${item.name || item.url || 'Request'}` : item.name || item.url || 'Request';
  }

  function requestRows(collection) {
    return (collection.items || []).map((item) => ({
      name: item.name || item.url || 'Request',
      path: requestPath(item),
      method: item.method || 'GET',
      url: item.url || '',
      auth: item.auth?.type || 'none',
      assertions: Array.isArray(item.assertions) ? item.assertions.filter((a) => a && a.enabled !== false).length : 0,
      bodyMode: item.body?.mode || 'none'
    }));
  }

  function collectionsToMarkdown(collections, { title = 'API Documentation' } = {}) {
    const lines = [`# ${title}`, ''];
    for (const col of collections || []) {
      lines.push(`## ${col.name || 'Collection'}`, '');
      if (col.description) lines.push(col.description, '');
      lines.push('| Request | Method | URL | Auth | Body | Assertions |', '| --- | --- | --- | --- | --- | --- |');
      for (const row of requestRows(col)) {
        lines.push(`| ${escapeMdCell(row.path)} | ${row.method} | ${escapeMdCell(row.url)} | ${row.auth} | ${row.bodyMode} | ${row.assertions} |`);
      }
      lines.push('');
    }
    return `${lines.join('\n').trimEnd()}\n`;
  }

  function collectionsToHtml(collections, { title = 'API Documentation' } = {}) {
    const sections = (collections || [])
      .map((col) => {
        const rows = requestRows(col)
          .map(
            (row) => `<tr>
              <td>${escapeHtml(row.path)}</td>
              <td><code>${escapeHtml(row.method)}</code></td>
              <td><code>${escapeHtml(row.url)}</code></td>
              <td>${escapeHtml(row.auth)}</td>
              <td>${escapeHtml(row.bodyMode)}</td>
              <td>${row.assertions}</td>
            </tr>`
          )
          .join('');
        return `<section>
          <h2>${escapeHtml(col.name || 'Collection')}</h2>
          ${col.description ? `<p>${escapeHtml(col.description)}</p>` : ''}
          <table>
            <thead><tr><th>Request</th><th>Method</th><th>URL</th><th>Auth</th><th>Body</th><th>Assertions</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </section>`;
      })
      .join('\n');

    return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;margin:32px;color:#1f2937;background:#fff}
    h1{font-size:28px} h2{margin-top:32px;border-bottom:1px solid #e5e7eb;padding-bottom:8px}
    table{border-collapse:collapse;width:100%;font-size:14px}
    th,td{border:1px solid #e5e7eb;padding:8px;text-align:left;vertical-align:top}
    th{background:#f9fafb} code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
    @media (prefers-color-scheme: dark){body{background:#111827;color:#e5e7eb}th{background:#1f2937}th,td{border-color:#374151}}
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${sections}
</body>
</html>
`;
  }

  return {
    escapeHtml,
    escapeMdCell,
    requestRows,
    collectionsToMarkdown,
    collectionsToHtml
  };
});
