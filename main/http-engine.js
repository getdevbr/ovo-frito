'use strict';

const http = require('http');
const https = require('https');
const tls = require('tls');
const { isTextual } = require('../renderer/lib/content-sniff');
const { signAwsRequest, parseDigestChallenge, buildDigestAuthorization, randomCnonce } = require('./auth-signers');

function sanitizeHeaderValue(str) {
  return String(str ?? '').replace(/[\r\n]+/g, ' ').replace(/"/g, "'").trim();
}

function buildMultipartBuffer(formdataRows) {
  const boundary = `----CarteiroBoundary${Date.now().toString(16)}${Math.random().toString(16).slice(2, 8)}`;
  const chunks = [];

  for (const row of formdataRows || []) {
    if (!row || row.enabled === false || !row.key) continue;
    const fieldName = sanitizeHeaderValue(row.key);
    if (row.type === 'file' && row.fileBase64) {
      const fileName = sanitizeHeaderValue(row.fileName || 'upload.bin');
      const contentType = sanitizeHeaderValue(row.fileContentType || 'application/octet-stream');
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

function createHttpEngine({ storage, cookieJar }) {
  function resolveNetworkSettings(requestSpec) {
    const storedSettings = storage.readStore('settings') || {};
    const net = {
      ignoreCertErrors: storedSettings.ignoreCertErrors !== undefined ? Boolean(storedSettings.ignoreCertErrors) : false,
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
      const elapsedMs = () => Math.round(Number(process.hrtime.bigint() - startTime) / 1e6);
      const timings = { dnsMs: null, connectMs: null, tlsMs: null, ttfbMs: null, downloadMs: null };
      let socketReadyAt = 0;
      let ttfbAt = null;
      const attachSocketTimings = (req) => {
        req.on('socket', (socket) => {
          let lookupAt = null;
          let connectAt = null;
          socket.on('lookup', () => {
            const now = elapsedMs();
            lookupAt = now;
            timings.dnsMs = now;
            if (!socketReadyAt) socketReadyAt = now;
          });
          socket.on('connect', () => {
            const now = elapsedMs();
            connectAt = now;
            timings.connectMs = Math.max(0, now - (lookupAt ?? 0));
            socketReadyAt = now;
          });
          socket.on('secureConnect', () => {
            const now = elapsedMs();
            timings.tlsMs = connectAt === null ? null : Math.max(0, now - connectAt);
            socketReadyAt = now;
          });
        });
      };

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
        } else if (requestSpec.auth.type === 'digest' && requestSpec.auth.digestAuthorization) {
          headers['Authorization'] = String(requestSpec.auth.digestAuthorization);
        }
      }

      if (cookieJar && !Object.keys(headers).some((k) => k.toLowerCase() === 'cookie')) {
        const jarCookieHeader = cookieJar.getHeaderForHost(
          parsedUrl.hostname,
          parsedUrl.pathname || '/',
          parsedUrl.protocol === 'https:'
        );
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
        headers['User-Agent'] = 'OvoFrito-Local/1.3.0 (100%-Local-First)';
      }

      if (requestSpec.auth?.type === 'aws_sigv4') {
        signAwsRequest({ method, url: parsedUrl, headers, bodyBuffer, auth: requestSpec.auth });
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
        ttfbAt = elapsedMs();
        timings.ttfbMs = socketReadyAt ? Math.max(0, ttfbAt - socketReadyAt) : ttfbAt;
        const storedSettings = storage.readStore('settings') || {};
        const authCfg = requestSpec.auth || {};
        if (authCfg.type === 'digest' && !requestSpec.__digestRetried && res.statusCode === 401) {
          const challenge = parseDigestChallenge(res.headers?.['www-authenticate']);
          if (challenge) {
            res.resume();
            res.on('end', () => {
              const uri = parsedUrl.pathname + parsedUrl.search;
              const digestAuthorization = buildDigestAuthorization({
                method,
                uri,
                username: authCfg.username,
                password: authCfg.password,
                challenge,
                cnonce: randomCnonce()
              });
              if (!digestAuthorization) return resolve({
                ok: false,
                error: 'Falha ao montar header Digest a partir do desafio 401',
                status: res.statusCode,
                statusText: res.statusMessage || '',
                timeMs: Math.round(Number(process.hrtime.bigint() - startTime) / 1e6),
                sizeBytes: 0,
                headers: res.headers || {},
                cookies: [],
                body: ''
              });
              executeHttpRequest({
                ...requestSpec,
                __digestRetried: true,
                auth: { ...authCfg, digestAuthorization }
              }).then(resolve);
            });
            return;
          }
        }
        const maxBytes = Number(requestSpec.maxResponseBytes || storedSettings.maxResponseBytes) || 52428800;
        const chunks = [];
        let totalBytes = 0;
        let truncated = false;

        res.on('data', (chunk) => {
          if (totalBytes + chunk.length > maxBytes) {
            const remaining = Math.max(0, maxBytes - totalBytes);
            if (remaining > 0) chunks.push(chunk.subarray(0, remaining));
            totalBytes = maxBytes;
            truncated = true;
            res.destroy();
            return;
          }
          totalBytes += chunk.length;
          chunks.push(chunk);
        });
        res.on('end', () => {
          const endTime = process.hrtime.bigint();
          const timeMs = Math.round(Number(endTime - startTime) / 1e6);
          timings.downloadMs = ttfbAt === null ? null : Math.max(0, timeMs - ttfbAt);
          const fullBuffer = Buffer.concat(chunks);
          const contentType = String(res.headers?.['content-type'] || '');
          const textual = isTextual(contentType, fullBuffer);
          const bodyEncoding = textual ? 'utf8' : 'base64';
          const bodyText = fullBuffer.toString(bodyEncoding);
          const setCookieRaw = res.headers?.['set-cookie'] || [];
          const newCookies = cookieJar
            ? cookieJar.updateFromResponse(parsedUrl.hostname, Array.isArray(setCookieRaw) ? setCookieRaw : [setCookieRaw])
            : [];

          resolve({
            ok: true,
            status: res.statusCode || 0,
            statusText: res.statusMessage || '',
            timeMs,
            timings: { ...timings, totalMs: timeMs },
            sizeBytes: fullBuffer.length,
            contentType,
            bodyEncoding,
            truncated,
            headers: res.headers || {},
            cookies: newCookies,
            requestSent: {
              method,
              url: parsedUrl.toString(),
              network: networkMeta,
              headers,
              body: sentBodyPreview
            },
            body: bodyText
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
          timings: { ...timings, totalMs: timeMs },
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
        attachSocketTimings(connectReq);

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
          attachSocketTimings(req);

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
        attachSocketTimings(req);

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
      attachSocketTimings(req);
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

  return {
    executeHttpRequest,
    resolveNetworkSettings,
    buildMultipartBuffer,
    shouldBypassProxy,
    buildMtlsOptions
  };
}

module.exports = {
  createHttpEngine,
  buildMultipartBuffer,
  shouldBypassProxy,
  buildMtlsOptions
};
