/**
 * Servidor local zero-dependências (fallback / modo portátil rápido 100% Local-First)
 * Compartilha exatamente o mesmo diretório portátil `./data/` e o contrato IPC (`pm:storage:*`, `pm:runtime:request`)
 * do processo principal Electron (`main.js`).
 */
const http = require('http');
const https = require('https');
const tls = require('tls');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3456;
const DATA_DIR = path.join(__dirname, 'data');
const RENDERER_DIR = path.join(__dirname, 'renderer');

const FILES = {
  collections: path.join(DATA_DIR, 'collections.json'),
  environments: path.join(DATA_DIR, 'environments.json'),
  history: path.join(DATA_DIR, 'history.json'),
  settings: path.join(DATA_DIR, 'settings.json'),
  sessions: path.join(DATA_DIR, 'sessions.json'),
  cookies: path.join(DATA_DIR, 'cookies.json')
};

function ensurePortableDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const defaults = {
    collections: [
      {
        id: 'col_sample_1',
        name: 'JSONPlaceholder API',
        items: [
          {
            id: 'req_sample_1',
            name: '1. Criar Post (Gera ID/Token)',
            folder: 'Fluxo Encadeado',
            method: 'POST',
            url: '{{base_url}}/posts',
            params: [],
            headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
            auth: { type: 'none', token: '', username: '', password: '', keyName: '', keyValue: '', addTo: 'header' },
            body: {
              mode: 'json',
              raw: JSON.stringify({ title: 'Carteiro Local-First', body: 'Reconstruído via REA', userId: 1 }, null, 2),
              urlencoded: [],
              formdata: []
            },
            assertions: [{ source: 'status', operator: '==', target: '201', enabled: true }],
            captures: [{ key: 'json.id', value: 'ultimo_post_id', enabled: true }]
          },
          {
            id: 'req_sample_2',
            name: '2. Listar Posts (Usa Auth da Req 1)',
            folder: 'Fluxo Encadeado',
            method: 'GET',
            url: '{{base_url}}/posts?_limit=5',
            params: [{ key: '_limit', value: '5', enabled: true }],
            headers: [{ key: 'Accept', value: 'application/json', enabled: true }],
            auth: {
              type: 'bearer',
              token: '{{@1. Criar Post (Gera ID/Token).json.id}}',
              username: '',
              password: '',
              keyName: '',
              keyValue: '',
              addTo: 'header'
            },
            body: { mode: 'none', raw: '', urlencoded: [], formdata: [] },
            assertions: [{ source: 'status', operator: '==', target: '200', enabled: true }],
            captures: []
          }
        ]
      }
    ],
    environments: [
      {
        id: 'env_default',
        name: 'JSONPlaceholder (Local)',
        profile: '',
        borderColor: '',
        customProfiles: [],
        profileVariables: {},
        variables: [
          { key: 'base_url', value: 'https://jsonplaceholder.typicode.com', enabled: true, secret: false },
          { key: 'api_token', value: 'demo-secret-token', enabled: true, secret: true }
        ]
      }
    ],
    history: [],
    settings: {
      theme: 'dark',
      activeEnvironmentId: 'env_default',
      timeoutMs: 30000
    },
    sessions: {
      tabs: [],
      activeTabId: null,
      responseCache: {}
    },
    cookies: []
  };

  for (const [key, filePath] of Object.entries(FILES)) {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaults[key], null, 2), 'utf8');
    }
  }
}

function readStore(key) {
  try {
    if (!FILES[key] || !fs.existsSync(FILES[key])) return null;
    return JSON.parse(fs.readFileSync(FILES[key], 'utf8'));
  } catch {
    return null;
  }
}

function writeStore(key, data) {
  try {
    if (!FILES[key]) return false;
    fs.writeFileSync(FILES[key], JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}

function parseSetCookieHeader(rawCookieStr, defaultDomain) {
  const parts = String(rawCookieStr || '').split(';').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const firstEq = parts[0].indexOf('=');
  if (firstEq === -1) return null;
  const name = parts[0].slice(0, firstEq).trim();
  const value = parts[0].slice(firstEq + 1).trim();
  let domain = defaultDomain;
  let cookiePath = '/';
  let httpOnly = false;
  let secure = false;

  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    const eq = p.indexOf('=');
    const k = (eq !== -1 ? p.slice(0, eq) : p).trim().toLowerCase();
    const v = eq !== -1 ? p.slice(eq + 1).trim() : '';
    if (k === 'domain' && v) domain = v.replace(/^\./, '').toLowerCase();
    if (k === 'path' && v) cookiePath = v;
    if (k === 'httponly') httpOnly = true;
    if (k === 'secure') secure = true;
  }

  return { name, value, domain: domain.toLowerCase(), path: cookiePath, httpOnly, secure, updatedAt: new Date().toISOString() };
}

function updateCookieJarFromResponse(hostname, setCookieHeaders) {
  if (!Array.isArray(setCookieHeaders) || setCookieHeaders.length === 0) return [];
  const jar = Array.isArray(readStore('cookies')) ? readStore('cookies') : [];
  const parsedList = [];

  for (const raw of setCookieHeaders) {
    const parsed = parseSetCookieHeader(raw, hostname);
    if (!parsed) continue;
    parsedList.push(parsed);
    const idx = jar.findIndex((c) => c.domain === parsed.domain && c.name === parsed.name && c.path === parsed.path);
    if (idx !== -1) {
      jar[idx] = parsed;
    } else {
      jar.push(parsed);
    }
  }
  writeStore('cookies', jar);
  return parsedList;
}

function getCookieHeaderForHost(hostname) {
  const jar = Array.isArray(readStore('cookies')) ? readStore('cookies') : [];
  const host = String(hostname || '').toLowerCase();
  const matching = jar.filter((c) => c && c.name && (host === c.domain || host.endsWith('.' + c.domain)));
  if (matching.length === 0) return '';
  return matching.map((c) => `${c.name}=${c.value}`).join('; ');
}

function buildMultipartBuffer(formdataRows) {
  const boundary = `----CarteiroBoundary${Date.now().toString(16)}${Math.random().toString(16).slice(2, 8)}`;
  const chunks = [];

  for (const row of formdataRows || []) {
    if (!row || row.enabled === false || !row.key) continue;
    const fieldName = String(row.key).replace(/"/g, '\\"');
    if (row.type === 'file' && row.fileBase64) {
      const fileName = String(row.fileName || 'upload.bin').replace(/"/g, '\\"');
      const contentType = row.fileContentType || 'application/octet-stream';
      chunks.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\nContent-Type: ${contentType}\r\n\r\n`,
          'utf8'
        )
      );
      chunks.push(Buffer.from(row.fileBase64, 'base64'));
      chunks.push(Buffer.from('\r\n', 'utf8'));
    } else {
      const val = String(row.value ?? '');
      chunks.push(
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"\r\n\r\n${val}\r\n`, 'utf8')
      );
    }
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
  return { boundary, buffer: Buffer.concat(chunks) };
}

function shouldBypassProxy(hostname, bypassListStr) {
  if (!hostname || !bypassListStr) return false;
  const host = String(hostname).toLowerCase().trim();
  const rules = String(bypassListStr)
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  for (const rule of rules) {
    if (rule === '*' || rule === host) return true;
    if (rule.startsWith('*.') && host.endsWith(rule.slice(1))) return true;
    if (rule.startsWith('.') && (host === rule.slice(1) || host.endsWith(rule))) return true;
  }
  return false;
}

function resolveNetworkSettings(requestSpec) {
  const storedSettings = readStore('settings') || {};
  const net = {
    ignoreCertErrors: storedSettings.ignoreCertErrors !== undefined ? Boolean(storedSettings.ignoreCertErrors) : true,
    proxy: {
      enabled: false,
      protocol: 'http',
      host: '',
      port: '8080',
      username: '',
      password: '',
      bypass: 'localhost, 127.0.0.1, ::1',
      ...(storedSettings.proxy || {})
    },
    mtls: {
      enabled: false,
      fileName: '',
      certBase64: '',
      passphrase: '',
      ...(storedSettings.mtls || {})
    },
    ...(requestSpec.network || {})
  };
  if (requestSpec.network?.proxy) {
    net.proxy = { ...net.proxy, ...requestSpec.network.proxy };
  }
  if (requestSpec.network?.mtls) {
    net.mtls = { ...net.mtls, ...requestSpec.network.mtls };
  }
  return net;
}

function buildMtlsOptions(mtlsCfg) {
  if (!mtlsCfg || !mtlsCfg.enabled || !mtlsCfg.certBase64) return {};
  const buf = Buffer.from(mtlsCfg.certBase64, 'base64');
  const lower = String(mtlsCfg.fileName || '').toLowerCase();
  const opts = {};
  if (lower.endsWith('.pfx') || lower.endsWith('.p12')) {
    opts.pfx = buf;
  } else {
    opts.cert = buf;
  }
  if (mtlsCfg.passphrase) {
    opts.passphrase = String(mtlsCfg.passphrase);
  }
  return opts;
}

function executeHttpRequest(requestSpec) {
  return new Promise((resolve) => {
    const startTime = process.hrtime.bigint();
    let parsedUrl;
    try {
      let targetUrl = (requestSpec.url || '').trim();
      if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = 'http://' + targetUrl;
      }
      parsedUrl = new URL(targetUrl);
    } catch (err) {
      return resolve({
        ok: false,
        error: `URL inválida: ${err.message}`,
        status: 0,
        statusText: 'Invalid URL',
        timeMs: 0,
        sizeBytes: 0,
        headers: {},
        cookies: [],
        body: ''
      });
    }

    const netConfig = resolveNetworkSettings(requestSpec);
    const rejectUnauthorized = !netConfig.ignoreCertErrors;
    const isHttps = parsedUrl.protocol === 'https:';
    const method = (requestSpec.method || 'GET').toUpperCase();
    const timeoutMs = requestSpec.timeoutMs || 30000;

    const headers = {};
    if (Array.isArray(requestSpec.headers)) {
      for (const h of requestSpec.headers) {
        if (h && h.enabled !== false && h.key) {
          headers[h.key.trim()] = String(h.value ?? '');
        }
      }
    }

    if (requestSpec.auth) {
      if (requestSpec.auth.type === 'bearer' && requestSpec.auth.token) {
        headers['Authorization'] = `Bearer ${requestSpec.auth.token}`;
      } else if (requestSpec.auth.type === 'basic' && (requestSpec.auth.username || requestSpec.auth.password)) {
        const credentials = Buffer.from(`${requestSpec.auth.username || ''}:${requestSpec.auth.password || ''}`).toString('base64');
        headers['Authorization'] = `Basic ${credentials}`;
      } else if (requestSpec.auth.type === 'apikey' && requestSpec.auth.keyName && requestSpec.auth.keyValue) {
        if (requestSpec.auth.addTo === 'query') {
          parsedUrl.searchParams.set(requestSpec.auth.keyName.trim(), String(requestSpec.auth.keyValue));
        } else {
          headers[requestSpec.auth.keyName.trim()] = String(requestSpec.auth.keyValue);
        }
      } else if (requestSpec.auth.type === 'oauth2' && requestSpec.auth.token) {
        headers['Authorization'] = `Bearer ${requestSpec.auth.token}`;
      }
    }

    if (!Object.keys(headers).some((k) => k.toLowerCase() === 'cookie')) {
      const jarCookieHeader = getCookieHeaderForHost(parsedUrl.hostname);
      if (jarCookieHeader) {
        headers['Cookie'] = jarCookieHeader;
      }
    }

    let bodyBuffer = null;
    let sentBodyPreview = '';
    if (!['GET', 'HEAD'].includes(method) && requestSpec.body) {
      if (requestSpec.body.mode === 'json' || requestSpec.body.mode === 'raw') {
        const rawText = String(requestSpec.body.raw || '');
        sentBodyPreview = rawText;
        bodyBuffer = Buffer.from(rawText, 'utf8');
        if (requestSpec.body.mode === 'json' && !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
          headers['Content-Type'] = 'application/json';
        }
      } else if (requestSpec.body.mode === 'graphql') {
        let parsedVars = {};
        if (requestSpec.body.graphqlVars && String(requestSpec.body.graphqlVars).trim()) {
          try {
            parsedVars = JSON.parse(requestSpec.body.graphqlVars);
          } catch {
            parsedVars = requestSpec.body.graphqlVars;
          }
        }
        const gqlPayload = JSON.stringify({
          query: String(requestSpec.body.graphqlQuery || ''),
          variables: parsedVars
        });
        sentBodyPreview = gqlPayload;
        bodyBuffer = Buffer.from(gqlPayload, 'utf8');
        if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
          headers['Content-Type'] = 'application/json';
        }
      } else if (requestSpec.body.mode === 'urlencoded' && Array.isArray(requestSpec.body.urlencoded)) {
        const params = new URLSearchParams();
        for (const item of requestSpec.body.urlencoded) {
          if (item && item.enabled !== false && item.key) {
            params.append(item.key, String(item.value ?? ''));
          }
        }
        sentBodyPreview = params.toString();
        bodyBuffer = Buffer.from(sentBodyPreview, 'utf8');
        if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
          headers['Content-Type'] = 'application/x-www-form-urlencoded';
        }
      } else if (requestSpec.body.mode === 'formdata' && Array.isArray(requestSpec.body.formdata)) {
        const built = buildMultipartBuffer(requestSpec.body.formdata);
        bodyBuffer = built.buffer;
        sentBodyPreview = `[Multipart Form-Data: ${bodyBuffer.length} bytes, boundary=${built.boundary}]`;
        headers['Content-Type'] = `multipart/form-data; boundary=${built.boundary}`;
      }
      if (bodyBuffer) {
        headers['Content-Length'] = bodyBuffer.length;
      }
    }

    if (!Object.keys(headers).some((k) => k.toLowerCase() === 'user-agent')) {
      headers['User-Agent'] = 'CarroDoOvo-Local/1.3.0 (100%-Local-First)';
    }

    const proxyCfg = netConfig.proxy || {};
    const useProxy =
      Boolean(proxyCfg.enabled) &&
      Boolean(String(proxyCfg.host || '').trim()) &&
      !shouldBypassProxy(parsedUrl.hostname, proxyCfg.bypass);

    const proxyHost = String(proxyCfg.host || '').trim().replace(/^https?:\/\//i, '');
    const proxyPort = Number(proxyCfg.port) || 8080;
    const proxyProtocol = String(proxyCfg.protocol || 'http').toLowerCase().startsWith('https') ? 'https:' : 'http:';
    const proxyAuthHeader =
      proxyCfg.username || proxyCfg.password
        ? `Basic ${Buffer.from(`${proxyCfg.username || ''}:${proxyCfg.password || ''}`).toString('base64')}`
        : '';

    const mtlsOptions = buildMtlsOptions(netConfig.mtls);

    const networkMeta = {
      sslVerification: rejectUnauthorized ? 'strict (rejectUnauthorized=true)' : 'ignored (rejectUnauthorized=false)',
      mtlsClientCert: netConfig.mtls?.enabled && netConfig.mtls?.fileName ? netConfig.mtls.fileName : 'none',
      proxy: useProxy ? `${proxyProtocol}//${proxyHost}:${proxyPort}` : 'direct (no proxy)'
    };

    const handleResponse = (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const endTime = process.hrtime.bigint();
        const timeMs = Math.round(Number(endTime - startTime) / 1e6);
        const fullBuffer = Buffer.concat(chunks);
        const setCookieRaw = res.headers?.['set-cookie'] || [];
        const newCookies = updateCookieJarFromResponse(parsedUrl.hostname, Array.isArray(setCookieRaw) ? setCookieRaw : [setCookieRaw]);

        resolve({
          ok: true,
          status: res.statusCode || 0,
          statusText: res.statusMessage || '',
          timeMs,
          sizeBytes: fullBuffer.length,
          headers: res.headers || {},
          cookies: newCookies,
          requestSent: {
            method,
            url: parsedUrl.toString(),
            network: networkMeta,
            headers,
            body: sentBodyPreview
          },
          body: fullBuffer.toString('utf8')
        });
      });
    };

    const handleError = (err) => {
      const endTime = process.hrtime.bigint();
      const timeMs = Math.round(Number(endTime - startTime) / 1e6);
      resolve({
        ok: false,
        error: err.message,
        status: 0,
        statusText: 'Network / SSL / Proxy Error',
        timeMs,
        sizeBytes: 0,
        headers: {},
        cookies: [],
        requestSent: {
          method,
          url: parsedUrl.toString(),
          network: networkMeta,
          headers,
          body: sentBodyPreview
        },
        body: ''
      });
    };

    if (useProxy && isHttps) {
      const proxyTransport = proxyProtocol === 'https:' ? https : http;
      const targetPort = Number(parsedUrl.port) || 443;
      const connectHeaders = {
        Host: `${parsedUrl.hostname}:${targetPort}`
      };
      if (proxyAuthHeader) {
        connectHeaders['Proxy-Authorization'] = proxyAuthHeader;
      }

      const connectReq = proxyTransport.request({
        host: proxyHost,
        port: proxyPort,
        method: 'CONNECT',
        path: `${parsedUrl.hostname}:${targetPort}`,
        headers: connectHeaders,
        timeout: timeoutMs,
        rejectUnauthorized
      });

      connectReq.on('connect', (connectRes, socket) => {
        if (connectRes.statusCode !== 200) {
          socket.destroy();
          return handleError(new Error(`Proxy recusou túnel CONNECT com status HTTP ${connectRes.statusCode} ${connectRes.statusMessage || ''}`));
        }
        const tlsSocket = tls.connect({
          socket,
          servername: parsedUrl.hostname,
          rejectUnauthorized,
          ...mtlsOptions
        });

        tlsSocket.on('error', handleError);

        const req = https.request(
          {
            protocol: 'https:',
            hostname: parsedUrl.hostname,
            port: targetPort,
            path: parsedUrl.pathname + parsedUrl.search,
            method,
            headers,
            timeout: timeoutMs,
            rejectUnauthorized,
            ...mtlsOptions,
            createConnection: () => tlsSocket
          },
          handleResponse
        );

        req.on('timeout', () => req.destroy(new Error('Tempo limite da requisição excedido (Timeout)')));
        req.on('error', handleError);
        if (bodyBuffer && bodyBuffer.length > 0) req.write(bodyBuffer);
        req.end();
      });

      connectReq.on('timeout', () => connectReq.destroy(new Error('Tempo limite de conexão ao Proxy excedido (Timeout)')));
      connectReq.on('error', handleError);
      connectReq.end();
      return;
    }

    if (useProxy && !isHttps) {
      const proxyTransport = proxyProtocol === 'https:' ? https : http;
      const proxyHeaders = { ...headers, Host: parsedUrl.host };
      if (proxyAuthHeader) {
        proxyHeaders['Proxy-Authorization'] = proxyAuthHeader;
      }
      const req = proxyTransport.request(
        {
          host: proxyHost,
          port: proxyPort,
          path: parsedUrl.toString(),
          method,
          headers: proxyHeaders,
          timeout: timeoutMs,
          rejectUnauthorized
        },
        handleResponse
      );

      req.on('timeout', () => req.destroy(new Error('Tempo limite da requisição via Proxy excedido (Timeout)')));
      req.on('error', handleError);
      if (bodyBuffer && bodyBuffer.length > 0) req.write(bodyBuffer);
      req.end();
      return;
    }

    const transport = isHttps ? https : http;
    const options = {
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers,
      timeout: timeoutMs,
      rejectUnauthorized,
      ...(isHttps ? mtlsOptions : {})
    };

    const req = transport.request(options, handleResponse);
    req.on('timeout', () => {
      req.destroy(new Error('Tempo limite da requisição excedido (Timeout)'));
    });
    req.on('error', handleError);

    if (bodyBuffer && bodyBuffer.length > 0) {
      req.write(bodyBuffer);
    }
    req.end();
  });
}

ensurePortableDataDir();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ovo': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/ipc') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      try {
        const { channel, payload } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        let result = null;
        if (channel === 'pm:storage:loadAll') {
          result = {
            collections: readStore('collections') || [],
            environments: readStore('environments') || [],
            history: readStore('history') || [],
            settings: readStore('settings') || { theme: 'dark', activeEnvironmentId: '' },
            sessions: readStore('sessions') || { tabs: [], activeTabId: null, responseCache: {} },
            cookies: readStore('cookies') || [],
            dataDir: DATA_DIR
          };
        } else if (channel === 'pm:storage:save') {
          result = { ok: writeStore(payload.key, payload.data) };
        } else if (channel === 'pm:runtime:request') {
          result = await executeHttpRequest(payload);
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: `Canal IPC desconhecido: ${channel}` }));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(RENDERER_DIR, path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, ''));

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Carteiro (100% Local-First) rodando em http://127.0.0.1:${PORT}`);
});
