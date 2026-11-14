'use strict';

const crypto = require('node:crypto');
const http = require('node:http');

function base64Url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

function createOAuthPkce({ openExternal, httpEngine, timeoutMs = 120000 } = {}) {
  let current = null;

  function status() {
    return { ok: true, active: Boolean(current) };
  }

  function cancel() {
    if (!current) return { ok: true, canceled: false };
    const flow = current;
    current = null;
    clearTimeout(flow.timer);
    try { flow.server.closeAllConnections?.(); flow.server.close(); } catch {}
    flow.finish({ ok: false, error: 'OAuth PKCE cancelado', canceled: true });
    return { ok: true, canceled: true };
  }

  async function exchangeCode({ tokenUrl, clientId, clientSecret, code, redirectUri, codeVerifier }) {
    const body = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier
    };
    if (clientSecret) body.client_secret = clientSecret;

    const formBody = Object.entries(body).map(([key, value]) => ({ key, value: String(value ?? ''), enabled: true }));
    if (httpEngine?.executeHttpRequest) {
      const res = await httpEngine.executeHttpRequest({
        method: 'POST',
        url: tokenUrl,
        headers: [{ key: 'Content-Type', value: 'application/x-www-form-urlencoded', enabled: true }],
        body: { mode: 'urlencoded', urlencoded: formBody },
        timeoutMs: 30000
      });
      if (!res.ok) throw new Error(res.error || res.statusText || `Token endpoint HTTP ${res.status}`);
      return JSON.parse(res.body || '{}');
    }

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString()
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) throw new Error(json.error_description || json.error || `Token endpoint HTTP ${res.status}`);
    return json;
  }

  function start(cfg = {}) {
    if (current) cancel();
    const authorizationUrl = String(cfg.authorizationUrl || '').trim();
    const tokenUrl = String(cfg.tokenUrl || '').trim();
    const clientId = String(cfg.clientId || '').trim();
    if (!/^https?:\/\//i.test(authorizationUrl)) return Promise.resolve({ ok: false, error: 'authorizationUrl inválida' });
    if (!/^https?:\/\//i.test(tokenUrl)) return Promise.resolve({ ok: false, error: 'tokenUrl inválida' });
    if (!clientId) return Promise.resolve({ ok: false, error: 'clientId obrigatório' });

    const port = Number(cfg.redirectPort) || 0;
    const codeVerifier = base64Url(crypto.randomBytes(48));
    const codeChallenge = base64Url(crypto.createHash('sha256').update(codeVerifier).digest());
    const state = base64Url(crypto.randomBytes(16));

    return new Promise((resolve) => {
      let settled = false;
      const finish = (payload) => {
        if (settled) return;
        settled = true;
        if (current?.finish === finish) current = null;
        clearTimeout(timer);
        try { server.closeAllConnections?.(); server.close(); } catch {}
        resolve(payload);
      };

      const server = http.createServer(async (req, res) => {
        try {
          const url = new URL(req.url || '/', 'http://127.0.0.1');
          if (url.pathname !== '/callback') {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not found');
            return;
          }
          const code = url.searchParams.get('code');
          const returnedState = url.searchParams.get('state');
          const oauthError = url.searchParams.get('error');
          if (oauthError) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<h1>OAuth falhou</h1><p>Pode fechar esta aba.</p>');
            finish({ ok: false, error: url.searchParams.get('error_description') || oauthError });
            return;
          }
          if (!code || returnedState !== state) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<h1>Callback OAuth inválido</h1><p>Pode fechar esta aba.</p>');
            finish({ ok: false, error: 'Callback OAuth inválido ou state divergente' });
            return;
          }

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<h1>Autorização concluída</h1><p>Você pode fechar esta aba e voltar ao Ovo Frito.</p>');
          try {
            const tokens = await exchangeCode({
              tokenUrl,
              clientId,
              clientSecret: String(cfg.clientSecret || ''),
              code,
              redirectUri: `http://127.0.0.1:${server.address().port}/callback`,
              codeVerifier
            });
            finish({ ok: true, tokens });
          } catch (err) {
            finish({ ok: false, error: err?.message || String(err) });
          }
        } catch (err) {
          finish({ ok: false, error: err?.message || String(err) });
        }
      });

      const timer = setTimeout(() => finish({ ok: false, error: 'Timeout aguardando callback OAuth' }), timeoutMs);
      timer.unref?.();

      server.on('error', (err) => finish({ ok: false, error: err?.message || String(err) }));
      current = { server, timer, finish };
      server.listen(port, '127.0.0.1', () => {
        const actualPort = server.address().port;
        const redirectUri = `http://127.0.0.1:${actualPort}/callback`;
        const auth = new URL(authorizationUrl);
        auth.searchParams.set('response_type', 'code');
        auth.searchParams.set('client_id', clientId);
        auth.searchParams.set('redirect_uri', redirectUri);
        auth.searchParams.set('state', state);
        auth.searchParams.set('code_challenge', codeChallenge);
        auth.searchParams.set('code_challenge_method', 'S256');
        const scopes = String(cfg.scopes || '').trim();
        if (scopes) auth.searchParams.set('scope', scopes);

        try {
          if (openExternal) openExternal(auth.toString());
        } catch (err) {
          finish({ ok: false, error: `Falha ao abrir navegador: ${err?.message || err}` });
        }
      });
    });
  }

  return { start, cancel, status };
}

module.exports = { createOAuthPkce };
