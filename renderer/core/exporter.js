
function generateBruContent(tab) {
  if (!tab) return '';
  const methodLower = (tab.method || 'GET').toLowerCase();
  const bodyTag = tab.body?.mode === 'json' ? 'json' : tab.body?.mode === 'raw' ? 'text' : tab.body?.mode === 'urlencoded' ? 'formUrlEncoded' : 'none';
  const authTag = tab.auth?.type === 'bearer' ? 'bearer' : tab.auth?.type === 'basic' ? 'basic' : 'none';

  const lines = [
    `meta {`,
    `  name: ${tab.name || 'Request'}`,
    `  type: http`,
    `  seq: 1`,
    `}`,
    ``,
    `${methodLower} {`,
    `  url: ${tab.url || ''}`,
    `  body: ${bodyTag}`,
    `  auth: ${authTag}`,
    `}`
  ];

  const activeParams = (tab.params || []).filter((p) => p.key);
  if (activeParams.length > 0) {
    lines.push(``, `params:query {`);
    activeParams.forEach((p) => {
      lines.push(`  ${p.enabled === false ? '~' : ''}${p.key}: ${p.value ?? ''}`);
    });
    lines.push(`}`);
  }

  const activeHeaders = (tab.headers || []).filter((h) => h.key);
  if (activeHeaders.length > 0) {
    lines.push(``, `headers {`);
    activeHeaders.forEach((h) => {
      lines.push(`  ${h.enabled === false ? '~' : ''}${h.key}: ${h.value ?? ''}`);
    });
    lines.push(`}`);
  }

  if (tab.auth?.type === 'bearer' && tab.auth.token) {
    lines.push(``, `auth:bearer {`, `  token: ${tab.auth.token}`, `}`);
  }

  if (tab.body?.mode === 'json' && tab.body.raw) {
    lines.push(``, `body:json {`, tab.body.raw, `}`);
  } else if (tab.body?.mode === 'raw' && tab.body.raw) {
    lines.push(``, `body:text {`, tab.body.raw, `}`);
  }

  const activeAsserts = (tab.assertions || []).filter((a) => a.enabled !== false && a.source);
  if (activeAsserts.length > 0) {
    const revOp = { '==': 'eq', '!=': 'neq', '<': 'lt', '<=': 'lte', '>': 'gt', contains: 'contains', exists: 'exists' };
    lines.push(``, `assert {`);
    activeAsserts.forEach((a) => {
      const brSrc = a.source === 'status' ? 'res.status' : a.source.startsWith('json.') ? `res.body.${a.source.slice(5)}` : `res.${a.source}`;
      lines.push(`  ${brSrc}: ${revOp[a.operator] || 'eq'} ${a.target ?? ''}`);
    });
    lines.push(`}`);
  }

  return lines.join('\n');
}


/* ============================================================================
 * Formato Nativo Ovo Frito (.ovo) — Exportação e Importação 100% Local
 * ============================================================================ */
function isSecretLikeValue(value) {
  const s = String(value ?? '');
  return s !== '' && !s.startsWith('{{') && !s.startsWith('@');
}


function sanitizeAuthForExport(auth) {
  if (!auth || typeof auth !== 'object') return auth;
  const clean = { ...auth };
  for (const key of ['token', 'password', 'keyValue', 'clientSecret', 'secretKey', 'sessionToken']) {
    if (isSecretLikeValue(clean[key])) clean[key] = '';
  }
  return clean;
}


function sanitizeHeadersForExport(headers) {
  const sensitive = /(authorization|proxy-authorization|cookie|set-cookie|x-api-key|token|secret|api[-_]?key|password|credential)/i;
  return (headers || []).map((h) => {
    if (!h || typeof h !== 'object') return h;
    const key = String(h.key || '');
    if (sensitive.test(key)) {
      return { ...h, value: '' };
    }
    return h;
  });
}


function sanitizeHistoryForExport(history) {
  return (history || []).map((h) => {
    if (!h || typeof h !== 'object') return h;
    const clean = { ...h };
    if (clean.requestSent?.resolvedAuth) clean.requestSent = { ...clean.requestSent, resolvedAuth: sanitizeAuthForExport(clean.requestSent.resolvedAuth) };
    if (clean.auth) clean.auth = sanitizeAuthForExport(clean.auth);
    if (clean.headers) clean.headers = sanitizeHeadersForExport(clean.headers);
    return clean;
  });
}


function generateOvoContent(tab) {
  if (!tab) return '';
  const ovoDoc = {
    format: 'ovo-frito/v1',
    type: 'request',
    app: 'Ovo Frito — 100% Local-First API Client',
    exportedAt: new Date().toISOString(),
    request: {
      name: tab.name || 'Requisição',
      folder: tab.folder || '',
      method: tab.method || 'GET',
      url: tab.url || '',
      params: tab.params || [],
      headers: sanitizeHeadersForExport(tab.headers || []),
      auth: sanitizeAuthForExport(tab.auth || { type: 'none' }),
      body: tab.body || { mode: 'none' },
      assertions: tab.assertions || [],
      captures: tab.captures || [],
      preRequestScript: tab.preRequestScript || '',
      postResponseScript: tab.postResponseScript || '',
      history: sanitizeHistoryForExport(Array.isArray(tab.history) ? tab.history : [])
    }
  };
  return JSON.stringify(ovoDoc, null, 2);
}


function exportRequestAsOvo(tab) {
  if (!tab) return;
  const content = generateOvoContent(tab);
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const slug = (tab.name || 'requisicao').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'requisicao';
  a.download = `${slug}.ovo`;
  a.click();
  URL.revokeObjectURL(a.href);
  document.getElementById('statusMessage').textContent = `Arquivo nativo "${slug}.ovo" exportado com sucesso!`;
}


function exportCollectionAsOvo(col) {
  if (!col) return;
  const ovoCol = {
    format: 'ovo-frito/v1',
    type: 'collection',
    app: 'Ovo Frito — 100% Local-First API Client',
    exportedAt: new Date().toISOString(),
    collection: {
      id: col.id,
      name: col.name,
      auth: sanitizeAuthForExport(col.auth || { type: 'none' }),
      variables: (Array.isArray(col.variables) ? col.variables : []).map((v) => (v?.secret ? { ...v, value: '' } : v)),
      items: (col.items || []).map((it) => ({
        ...it,
        headers: sanitizeHeadersForExport(it.headers || []),
        auth: sanitizeAuthForExport(it.auth || { type: 'none' }),
        history: sanitizeHistoryForExport(Array.isArray(it.history) ? it.history : [])
      }))
    }
  };
  const blob = new Blob([JSON.stringify(ovoCol, null, 2)], { type: 'application/json;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const slug = (col.name || 'collection').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'collection';
  a.download = `${slug}.ovo`;
  a.click();
  URL.revokeObjectURL(a.href);
  document.getElementById('statusMessage').textContent = `Collection "${col.name}" exportada no formato nativo "${slug}.ovo"!`;
}


function exportWorkspaceAsOvo() {
  const ovoWorkspace = {
    format: 'ovo-frito/v1',
    type: 'workspace',
    app: 'Ovo Frito — 100% Local-First API Client',
    exportedAt: new Date().toISOString(),
    collections: (state.collections || []).map((col) => ({
      ...col,
      auth: sanitizeAuthForExport(col.auth || { type: 'none' }),
      variables: (Array.isArray(col.variables) ? col.variables : []).map((v) => (v?.secret ? { ...v, value: '' } : v)),
      items: (col.items || []).map((it) => ({
        ...it,
        headers: sanitizeHeadersForExport(it.headers || []),
        auth: sanitizeAuthForExport(it.auth || { type: 'none' }),
        history: sanitizeHistoryForExport(Array.isArray(it.history) ? it.history : [])
      }))
    })),
    environments: (state.environments || []).map((env) => ({
      ...env,
      variables: (Array.isArray(env.variables) ? env.variables : []).map((v) => (v?.secret ? { ...v, value: '' } : v))
    })),
    settings: {
      theme: state.settings?.theme || 'dark',
      activeEnvironmentId: state.settings?.activeEnvironmentId || '',
      ignoreCertErrors: state.settings?.ignoreCertErrors ?? false,
      timeoutMs: state.settings?.timeoutMs || 30000
    }
  };
  const blob = new Blob([JSON.stringify(ovoWorkspace, null, 2)], { type: 'application/json;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const dateSlug = new Date().toISOString().slice(0, 10);
  a.download = `ovo-frito-workspace-${dateSlug}.ovo`;
  a.click();
  URL.revokeObjectURL(a.href);
  document.getElementById('statusMessage').textContent = `Workspace completo exportado como "ovo-frito-workspace-${dateSlug}.ovo"!`;
}


/* ============================================================================
 * US-02: Gerador de Snippets de Código (Codegen) + Nativo .ovo
 * ============================================================================ */
function generateCodeSnippet(tab, lang) {
  if (!tab) return '';
  if (lang === 'ovo') return generateOvoContent(tab);
  if (lang === 'bru') return generateBruContent(tab);

  const method = (tab.method || 'GET').toUpperCase();
  const url = interpolateVariables(tab.url || 'http://localhost');
  const headersObj = {};

  for (const h of tab.headers || []) {
    if (h && h.enabled !== false && h.key) {
      headersObj[interpolateVariables(h.key.trim())] = interpolateVariables(String(h.value ?? ''));
    }
  }

  const effAuth = resolveEffectiveTabAuth(tab);
  if (effAuth) {
    if ((effAuth.type === 'bearer' || effAuth.type === 'oauth2') && effAuth.token) {
      headersObj['Authorization'] = `Bearer ${interpolateVariables(effAuth.token)}`;
    } else if (effAuth.type === 'basic' && (effAuth.username || effAuth.password)) {
      const b64 = btoa(`${interpolateVariables(effAuth.username || '')}:${interpolateVariables(effAuth.password || '')}`);
      headersObj['Authorization'] = `Basic ${b64}`;
    } else if (effAuth.type === 'apikey' && effAuth.keyName && effAuth.keyValue && effAuth.addTo !== 'query') {
      headersObj[interpolateVariables(effAuth.keyName)] = interpolateVariables(effAuth.keyValue);
    }
  }

  let bodyStr = '';
  if (!['GET', 'HEAD'].includes(method) && tab.body) {
    if (tab.body.mode === 'json' || tab.body.mode === 'raw') {
      bodyStr = interpolateVariables(tab.body.raw || '');
      if (tab.body.mode === 'json' && !Object.keys(headersObj).some((k) => k.toLowerCase() === 'content-type')) {
        headersObj['Content-Type'] = 'application/json';
      }
    } else if (tab.body.mode === 'graphql') {
      let gVars = {};
      try {
        gVars = JSON.parse(interpolateVariables(tab.body.graphqlVars || '{}'));
      } catch {}
      bodyStr = JSON.stringify({ query: interpolateVariables(tab.body.graphqlQuery || ''), variables: gVars }, null, 2);
      if (!Object.keys(headersObj).some((k) => k.toLowerCase() === 'content-type')) {
        headersObj['Content-Type'] = 'application/json';
      }
    } else if (tab.body.mode === 'urlencoded') {
      const sp = new URLSearchParams();
      for (const u of tab.body.urlencoded || []) {
        if (u && u.enabled !== false && u.key) {
          sp.append(interpolateVariables(u.key), interpolateVariables(u.value || ''));
        }
      }
      bodyStr = sp.toString();
      if (!Object.keys(headersObj).some((k) => k.toLowerCase() === 'content-type')) {
        headersObj['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    }
  }

  if (lang === 'curl') {
    const net = ensureNetworkSettings();
    const lines = [`curl -X ${method} "${url}"`];
    if (net.ignoreCertErrors) {
      lines.push(`  --insecure`);
    }
    if (net.proxy?.enabled && net.proxy?.host) {
      const pProto = net.proxy.protocol || 'http';
      const pHost = interpolateVariables(net.proxy.host);
      const pPort = interpolateVariables(String(net.proxy.port || '8080'));
      const pUser = interpolateVariables(net.proxy.username || '');
      const pPass = interpolateVariables(net.proxy.password || '');
      const authPrefix = pUser || pPass ? `${encodeURIComponent(pUser)}:${encodeURIComponent(pPass)}@` : '';
      lines.push(`  -x "${pProto}://${authPrefix}${pHost}:${pPort}"`);
    }
    for (const [k, v] of Object.entries(headersObj)) {
      lines.push(`  -H "${k}: ${v.replace(/"/g, '\\"')}"`);
    }
    if (bodyStr) {
      lines.push(`  -d '${bodyStr.replace(/'/g, "'\\''")}'`);
    }
    return lines.join(' \\\n');
  }

  if (lang === 'fetch') {
    const opts = { method, headers: headersObj };
    if (bodyStr) opts.body = bodyStr;
    return `const response = await fetch(${JSON.stringify(url)}, ${JSON.stringify(opts, null, 2)});\nconst data = await response.json();\nconsole.log(data);`;
  }

  if (lang === 'axios') {
    const cfg = { method: method.toLowerCase(), url, headers: headersObj };
    if (bodyStr) {
      try {
        cfg.data = JSON.parse(bodyStr);
      } catch {
        cfg.data = bodyStr;
      }
    }
    return `const axios = require('axios');\n\nconst response = await axios(${JSON.stringify(cfg, null, 2)});\nconsole.log(response.data);`;
  }

  if (lang === 'python') {
    const lines = [
      `import requests`,
      ``,
      `url = ${JSON.stringify(url)}`,
      `headers = ${JSON.stringify(headersObj, null, 2)}`,
      bodyStr ? `payload = ${JSON.stringify(bodyStr)}` : `payload = None`,
      ``,
      `response = requests.request(${JSON.stringify(method)}, url, headers=headers, data=payload)`,
      `print(response.status_code)`,
      `print(response.text)`
    ];
    return lines.join('\n');
  }

  if (lang === 'powershell') {
    const lines = [`$headers = @{`];
    for (const [k, v] of Object.entries(headersObj)) {
      lines.push(`  "${k}" = "${v.replace(/"/g, '`"')}"`);
    }
    lines.push(`}`);
    let cmd = `Invoke-RestMethod -Uri "${url}" -Method ${method} -Headers $headers`;
    if (bodyStr) {
      lines.push(`$body = @'\n${bodyStr}\n'@`);
      cmd += ` -Body $body`;
    }
    lines.push(cmd);
    return lines.join('\n');
  }

  return '';
}


function exportCollectionAsPostmanV21(col) {
  const pmObj = {
    info: {
      _postman_id: generateUuidV4(),
      name: col.name,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    item: (col.items || []).map((it) => ({
      name: it.name || it.url,
      request: {
        method: it.method || 'GET',
        header: (it.headers || [])
          .filter((h) => h.key)
          .map((h) => ({ key: h.key, value: h.value || '', disabled: h.enabled === false })),
        url: {
          raw: it.url || '',
          query: (it.params || [])
            .filter((p) => p.key)
            .map((p) => ({ key: p.key, value: p.value || '', disabled: p.enabled === false }))
        },
        body:
          it.body?.mode === 'json' || it.body?.mode === 'raw'
            ? {
                mode: 'raw',
                raw: it.body.raw || '',
                options: { raw: { language: it.body.mode === 'json' ? 'json' : 'text' } }
              }
            : it.body?.mode === 'urlencoded'
            ? {
                mode: 'urlencoded',
                urlencoded: (it.body.urlencoded || []).map((u) => ({
                  key: u.key,
                  value: u.value || '',
                  disabled: u.enabled === false
                }))
              }
            : undefined
      }
    }))
  };

  const blob = new Blob([JSON.stringify(pmObj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(col.name || 'collection').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.postman_collection.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

(function (root) {
  const api = {
    generateBruContent,
    isSecretLikeValue,
    sanitizeAuthForExport,
    sanitizeHeadersForExport,
    sanitizeHistoryForExport,
    generateOvoContent,
    exportRequestAsOvo,
    exportCollectionAsOvo,
    exportWorkspaceAsOvo,
    generateCodeSnippet,
    exportCollectionAsPostmanV21
  };
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.exporter = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

