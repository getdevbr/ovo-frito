
/* ============================================================================
 * US-01: Parser de comando cURL
 * ============================================================================ */
function tokenizeCurlCommand(cmd) {
  const cleaned = cmd
    .replace(/\\\r?\n/g, ' ')
    .replace(/\^\r?\n/g, ' ')
    .trim();

  const tokens = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === '\\' && !inSingle && i + 1 < cleaned.length) {
      current += cleaned[++i];
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (/\s/.test(ch) && !inSingle && !inDouble) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (current.length > 0) tokens.push(current);
  return tokens;
}


function parseCurlCommand(rawText) {
  const tokens = tokenizeCurlCommand(rawText);
  if (tokens.length === 0 || !/^curl(\.exe)?$/i.test(tokens[0])) {
    return null;
  }

  let method = '';
  let url = '';
  const headers = [];
  const dataParts = [];
  const urlencodedParts = [];
  let auth = { type: 'none', token: '', username: '', password: '', keyName: '', keyValue: '', addTo: 'header' };

  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if ((t === '-X' || t === '--request') && i + 1 < tokens.length) {
      method = tokens[++i].toUpperCase();
    } else if ((t === '-H' || t === '--header') && i + 1 < tokens.length) {
      const hRaw = tokens[++i];
      const colonIdx = hRaw.indexOf(':');
      if (colonIdx !== -1) {
        const key = hRaw.slice(0, colonIdx).trim();
        const value = hRaw.slice(colonIdx + 1).trim();
        if (key.toLowerCase() === 'authorization' && /^bearer\s+/i.test(value)) {
          auth.type = 'bearer';
          auth.token = value.replace(/^bearer\s+/i, '').trim();
        } else {
          headers.push({ key, value, enabled: true });
        }
      }
    } else if (['-d', '--data', '--data-raw', '--data-binary'].includes(t) && i + 1 < tokens.length) {
      dataParts.push(tokens[++i]);
    } else if (t === '--data-urlencode' && i + 1 < tokens.length) {
      const pair = tokens[++i];
      const eq = pair.indexOf('=');
      if (eq !== -1) {
        urlencodedParts.push({ key: pair.slice(0, eq), value: pair.slice(eq + 1), enabled: true });
      } else {
        urlencodedParts.push({ key: pair, value: '', enabled: true });
      }
    } else if ((t === '-u' || t === '--user') && i + 1 < tokens.length) {
      const creds = tokens[++i];
      const colon = creds.indexOf(':');
      auth.type = 'basic';
      auth.username = colon !== -1 ? creds.slice(0, colon) : creds;
      auth.password = colon !== -1 ? creds.slice(colon + 1) : '';
    } else if (t === '--url' && i + 1 < tokens.length) {
      url = tokens[++i];
    } else if (!t.startsWith('-') && !url && /^https?:\/\//i.test(t)) {
      url = t;
    } else if (!t.startsWith('-') && !url && t.includes('.')) {
      url = t;
    }
  }

  let body = { mode: 'none', raw: '', urlencoded: [], formdata: [] };
  if (urlencodedParts.length > 0) {
    body = { mode: 'urlencoded', raw: '', urlencoded: urlencodedParts, formdata: [] };
    if (!method) method = 'POST';
  } else if (dataParts.length > 0) {
    const joined = dataParts.join('&');
    let isJson = false;
    try {
      JSON.parse(joined);
      isJson = true;
    } catch {
      isJson = headers.some((h) => h.key.toLowerCase() === 'content-type' && h.value.includes('json'));
    }
    body = { mode: isJson ? 'json' : 'raw', raw: joined, urlencoded: [], formdata: [] };
    if (!method) method = 'POST';
  }

  if (!method) method = 'GET';

  const tempTab = createBlankTab({
    name: `cURL: ${method} ${url.split('?')[0].slice(0, 32)}`,
    method,
    url,
    params: [],
    headers: headers.length > 0 ? headers : [{ key: 'Accept', value: 'application/json', enabled: true }],
    auth,
    body
  });
  syncParamsFromUrl(tempTab);
  return tempTab;
}


/* ============================================================================
 * US-12A: Conversor Bruno (.bru) <-> Carteiro (100% Local Git-Native)
 * ============================================================================ */
function parseBruFile(bruText) {
  if (!/\b(meta|get|post|put|patch|delete|head|options)\s*\{/i.test(bruText)) return null;

  function extractBlock(nameRegex) {
    const re = new RegExp(`(?:^|\\n)\\s*(${nameRegex})\\s*\\{([\\s\\S]*?)\\n\\}`, 'i');
    const m = bruText.match(re);
    return m ? { tag: m[1].trim().toLowerCase(), content: m[2] } : null;
  }

  const meta = extractBlock('meta');
  let reqName = 'Bruno Request';
  if (meta) {
    const nm = meta.content.match(/name:\s*(.+)/i);
    if (nm) reqName = nm[1].trim();
  }

  const methodBlock = extractBlock('get|post|put|patch|delete|head|options');
  const method = methodBlock ? methodBlock.tag.toUpperCase() : 'GET';
  let url = '';
  if (methodBlock) {
    const um = methodBlock.content.match(/url:\s*(.+)/i);
    if (um) url = um[1].trim();
  }

  const headers = [];
  const headersBlock = extractBlock('headers');
  if (headersBlock) {
    headersBlock.content.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const disabled = trimmed.startsWith('~');
      const clean = disabled ? trimmed.slice(1).trim() : trimmed;
      const idx = clean.indexOf(':');
      if (idx !== -1) {
        headers.push({ key: clean.slice(0, idx).trim(), value: clean.slice(idx + 1).trim(), enabled: !disabled });
      }
    });
  }

  let auth = { type: 'none', token: '', username: '', password: '', keyName: '', keyValue: '', addTo: 'header' };
  const bearerBlock = extractBlock('auth:bearer');
  if (bearerBlock) {
    const tm = bearerBlock.content.match(/token:\s*(.+)/i);
    auth.type = 'bearer';
    auth.token = tm ? tm[1].trim() : '';
  }

  let body = { mode: 'none', raw: '', urlencoded: [], formdata: [] };
  const jsonBlock = extractBlock('body:json');
  const textBlock = extractBlock('body:text');
  if (jsonBlock) {
    body = { mode: 'json', raw: jsonBlock.content.trim(), urlencoded: [], formdata: [] };
  } else if (textBlock) {
    body = { mode: 'raw', raw: textBlock.content.trim(), urlencoded: [], formdata: [] };
  }

  const assertions = [];
  const assertBlock = extractBlock('assert');
  if (assertBlock) {
    assertBlock.content.split(/\r?\n/).forEach((line) => {
      const m = line.trim().match(/^([^:]+):\s*(eq|neq|lt|lte|gt|contains|exists)\s*(.*)$/i);
      if (m) {
        const src = m[1].trim().replace(/^res\.body\./, 'json.').replace(/^res\./, '');
        const opMap = { eq: '==', neq: '!=', lt: '<', lte: '<=', gt: '>', contains: 'contains', exists: 'exists' };
        assertions.push({ source: src, operator: opMap[m[2].toLowerCase()] || '==', target: m[3].trim(), enabled: true });
      }
    });
  }

  const tab = createBlankTab({
    name: reqName,
    method,
    url,
    headers: headers.length > 0 ? headers : [{ key: 'Accept', value: 'application/json', enabled: true }],
    auth,
    body,
    assertions: assertions.length > 0 ? assertions : [{ source: 'status', operator: '==', target: '200', enabled: true }]
  });
  syncParamsFromUrl(tab);
  return tab;
}


function parseOvoFile(rawText) {
  try {
    const parsed = JSON.parse(rawText);
    if (
      parsed &&
      (parsed.format?.startsWith('ovo-frito') ||
        parsed.format?.startsWith('carro-do-ovo') || // legado
        parsed.type === 'request' ||
        parsed.type === 'collection' ||
        parsed.type === 'workspace')
    ) {
      if (parsed.type === 'workspace') {
        return {
          kind: 'workspace',
          collections: Array.isArray(parsed.collections) ? parsed.collections : [],
          profiles: Array.isArray(parsed.profiles)
            ? parsed.profiles
            : Array.isArray(parsed.environments) ? parsed.environments : []
        };
      }
      if (parsed.type === 'request' && parsed.request) {
        return { kind: 'request', tab: createBlankTab(parsed.request) };
      }
      if (parsed.type === 'collection' && parsed.collection) {
        return {
          kind: 'collection',
          collection: {
            ...parsed.collection,
            id: uid('col'),
            variables: Array.isArray(parsed.collection.variables) ? parsed.collection.variables : [],
            items: (parsed.collection.items || []).map((it) => ({
              ...it,
              id: it.id || uid('req'),
              history: Array.isArray(it.history) ? it.history : []
            }))
          }
        };
      }
    }
  } catch {}
  return null;
}


/* ============================================================================
 * US-03: Importar / Exportar Postman Collection v2.1 JSON
 * ============================================================================ */
function convertPostmanCollectionToCarteiro(pmJson) {
  const colName = pmJson.info?.name || pmJson.name || 'Collection Importada';
  const items = [];

  function walkItems(nodeList, folderPrefix = '') {
    for (const entry of nodeList || []) {
      if (Array.isArray(entry.item)) {
        const nextFolder = folderPrefix ? `${folderPrefix} / ${entry.name || 'Folder'}` : (entry.name || '');
        walkItems(entry.item, nextFolder);
      } else if (entry.request) {
        const req = entry.request;
        const method = (typeof req === 'string' ? 'GET' : req.method || 'GET').toUpperCase();
        let url = '';
        if (typeof req.url === 'string') {
          url = req.url;
        } else if (req.url && typeof req.url.raw === 'string') {
          url = req.url.raw;
        }

        const headers = (req.header || []).map((h) => ({
          key: h.key || '',
          value: h.value || '',
          enabled: !h.disabled
        }));

        let auth = { type: 'none', token: '', username: '', password: '', keyName: '', keyValue: '', addTo: 'header' };
        if (req.auth) {
          if (req.auth.type === 'bearer') {
            const tk = (req.auth.bearer || []).find((x) => x.key === 'token');
            auth.type = 'bearer';
            auth.token = tk ? tk.value : '';
          } else if (req.auth.type === 'basic') {
            const u = (req.auth.basic || []).find((x) => x.key === 'username');
            const p = (req.auth.basic || []).find((x) => x.key === 'password');
            auth.type = 'basic';
            auth.username = u ? u.value : '';
            auth.password = p ? p.value : '';
          }
        }

        let body = { mode: 'none', raw: '', urlencoded: [], formdata: [] };
        if (req.body) {
          if (req.body.mode === 'raw') {
            const rawStr = req.body.raw || '';
            let isJson = req.body.options?.raw?.language === 'json';
            if (!isJson) {
              try {
                JSON.parse(rawStr);
                isJson = true;
              } catch {}
            }
            body = { mode: isJson ? 'json' : 'raw', raw: rawStr, urlencoded: [], formdata: [] };
          } else if (req.body.mode === 'urlencoded') {
            body = {
              mode: 'urlencoded',
              raw: '',
              urlencoded: (req.body.urlencoded || []).map((u) => ({
                key: u.key || '',
                value: u.value || '',
                enabled: !u.disabled
              })),
              formdata: []
            };
          }
        }

        const temp = createBlankTab({
          name: entry.name || url,
          folder: folderPrefix,
          method,
          url,
          headers,
          auth,
          body
        });
        syncParamsFromUrl(temp);
        items.push({
          id: uid('req'),
          name: temp.name,
          folder: folderPrefix,
          method: temp.method,
          url: temp.url,
          params: temp.params,
          headers: temp.headers,
          auth: temp.auth,
          body: temp.body,
          assertions: temp.assertions,
          captures: temp.captures
        });
      }
    }
  }

  walkItems(pmJson.item || []);
  return {
    id: uid('col'),
    name: colName,
    items
  };
}


/* ============================================================================
 * US-16: Importador OpenAPI 3.0 / Swagger 2.0 JSON -> Collection Carteiro
 * ============================================================================ */
function buildOpenApiSampleFromSchema(schema, rootSpec, depth = 0) {
  if (!schema || depth > 4) return {};
  if (schema.$ref && typeof schema.$ref === 'string') {
    const refParts = schema.$ref.replace(/^#\//, '').split('/');
    let resolved = rootSpec;
    for (const p of refParts) resolved = resolved?.[p];
    if (resolved) return buildOpenApiSampleFromSchema(resolved, rootSpec, depth + 1);
  }
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.type === 'object' || schema.properties) {
    const obj = {};
    for (const [k, propSchema] of Object.entries(schema.properties || {})) {
      obj[k] = buildOpenApiSampleFromSchema(propSchema, rootSpec, depth + 1);
    }
    return obj;
  }
  if (schema.type === 'array') {
    return [buildOpenApiSampleFromSchema(schema.items || { type: 'string' }, rootSpec, depth + 1)];
  }
  if (schema.type === 'integer' || schema.type === 'number') return 1;
  if (schema.type === 'boolean') return true;
  return 'string';
}


function convertOpenApiToCarteiro(spec) {
  const title = spec.info?.title || 'OpenAPI Importada';
  let baseUrl = 'http://localhost:3000';
  if (Array.isArray(spec.servers) && spec.servers[0]?.url) {
    baseUrl = spec.servers[0].url.replace(/\/$/, '');
  } else if (spec.host) {
    const scheme = Array.isArray(spec.schemes) && spec.schemes[0] ? spec.schemes[0] : 'https';
    baseUrl = `${scheme}://${spec.host}${(spec.basePath || '').replace(/\/$/, '')}`;
  }

  const items = [];
  const httpMethods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

  for (const [routePath, pathObj] of Object.entries(spec.paths || {})) {
    if (!pathObj || typeof pathObj !== 'object') continue;
    for (const m of httpMethods) {
      const op = pathObj[m];
      if (!op) continue;

      const folder = Array.isArray(op.tags) && op.tags[0] ? op.tags[0] : '';
      const name = op.summary || op.operationId || `${m.toUpperCase()} ${routePath}`;
      const params = [];
      const headers = [{ key: 'Accept', value: 'application/json', enabled: true }];

      const allParams = [...(pathObj.parameters || []), ...(op.parameters || [])];
      for (const p of allParams) {
        if (p.in === 'query') {
          params.push({ key: p.name, value: p.example ?? p.default ?? '', enabled: !!p.required });
        } else if (p.in === 'header') {
          headers.push({ key: p.name, value: p.example ?? p.default ?? '', enabled: true });
        }
      }

      let body = { mode: 'none', raw: '', graphqlQuery: '', graphqlVars: '{\n  \n}', urlencoded: [], formdata: [] };
      const jsonMedia = op.requestBody?.content?.['application/json'];
      if (jsonMedia) {
        const sample = jsonMedia.example ?? buildOpenApiSampleFromSchema(jsonMedia.schema, spec);
        body = {
          mode: 'json',
          raw: JSON.stringify(sample, null, 2),
          graphqlQuery: '',
          graphqlVars: '{\n  \n}',
          urlencoded: [],
          formdata: []
        };
        headers.push({ key: 'Content-Type', value: 'application/json', enabled: true });
      }

      const fullUrl = `${baseUrl}${routePath.startsWith('/') ? '' : '/'}${routePath}`;
      const tab = createBlankTab({
        name,
        folder,
        method: m.toUpperCase(),
        url: fullUrl,
        params,
        headers,
        body
      });
      syncUrlFromParams(tab);
      items.push({
        id: uid('req'),
        name: tab.name,
        folder: tab.folder,
        method: tab.method,
        url: tab.url,
        params: tab.params,
        headers: tab.headers,
        auth: tab.auth,
        body: tab.body,
        assertions: tab.assertions,
        captures: tab.captures,
        preRequestScript: '',
        postResponseScript: ''
      });
    }
  }

  return {
    id: uid('col'),
    name: `${title} (OpenAPI)`,
    items
  };
}

(function (root) {
  const api = {
    tokenizeCurlCommand,
    parseCurlCommand,
    parseBruFile,
    parseOvoFile,
    convertPostmanCollectionToCarteiro,
    buildOpenApiSampleFromSchema,
    convertOpenApiToCarteiro
  };
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.importer = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

