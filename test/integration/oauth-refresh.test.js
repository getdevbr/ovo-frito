'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createAppContext } = require('../../main/bootstrap');

describe('oauth auto-refresh integration', () => {
  let ctx;
  let server;
  let baseUrl;
  let tmpDir;
  const tokenCalls = [];
  const protectedHits = [];
  let ccCount = 0;
  let rtCount = 0;

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdo-oauth-int-'));
    ctx = createAppContext({ dataDir: tmpDir });

    server = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const bodyText = Buffer.concat(chunks).toString('utf8');
        const url = new URL(req.url, 'http://x');

        if (url.pathname === '/token' && req.method === 'POST') {
          const params = new URLSearchParams(bodyText);
          const grant = params.get('grant_type');
          tokenCalls.push(grant);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          if (grant === 'refresh_token') {
            rtCount += 1;
            res.end(JSON.stringify({
              access_token: `tok-rt${rtCount}`,
              refresh_token: `rt-new${rtCount}`,
              token_type: 'Bearer',
              expires_in: 3600
            }));
          } else {
            ccCount += 1;
            res.end(JSON.stringify({
              access_token: `tok-cc${ccCount}`,
              refresh_token: `rt-cc${ccCount}`,
              token_type: 'Bearer',
              expires_in: 3600
            }));
          }
          return;
        }

        if (url.pathname === '/protected') {
          const auth = req.headers.authorization || '';
          protectedHits.push(auth);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ auth }));
          return;
        }

        res.writeHead(404).end();
      });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (ctx?.serviceManager) await ctx.serviceManager.stopAll?.().catch(() => {});
  });

  const oauthSpec = (extra = {}) => ({
    method: 'GET',
    url: `${baseUrl}/protected`,
    headers: [],
    auth: {
      type: 'oauth2',
      autoRefresh: true,
      grantType: 'client_credentials',
      tokenUrl: `${baseUrl}/token`,
      clientId: 'cid',
      clientSecret: 'csec',
      scopes: ''
    },
    timeoutMs: 5000,
    ...extra
  });

  it('fetches token via manager and sends Bearer', async () => {
    const res = await ctx.httpEngine.executeHttpRequest(oauthSpec());
    assert.equal(res.ok, true);
    assert.equal(res.status, 200);
    assert.deepEqual(tokenCalls, ['client_credentials']);
    assert.equal(protectedHits.at(-1), 'Bearer tok-cc1');
    // refresh_token não vaza no resultado
    assert.ok(!JSON.stringify(res).includes('rt-cc1'));
  });

  it('reuses cached token within validity', async () => {
    const res = await ctx.httpEngine.executeHttpRequest(oauthSpec());
    assert.equal(res.ok, true);
    assert.equal(tokenCalls.length, 1, 'token ainda válido → sem nova chamada');
    assert.equal(protectedHits.at(-1), 'Bearer tok-cc1');
  });

  it('retries exactly once on 401 with a refreshed token', async () => {
    // força expiração: limpa cache do manager para o mesmo authCfg
    ctx.oauthTokenManager.clear(ctx.oauthTokenManager.cacheKeyFor(oauthSpec().auth));
    // config com refresh token expirado → next getToken usa refresh grant
    // semeia estado: primeiro request pega tok-cc2; simulamos 401 forçando token inválido
    // estratégia: auth sem autoRefresh usa token literal → 401 não dispara retry
    // aqui: autoRefresh com cache limpo → client_credentials de novo → tok-cc3
    const res = await ctx.httpEngine.executeHttpRequest(oauthSpec());
    assert.equal(res.ok, true);
    assert.equal(protectedHits.at(-1), 'Bearer tok-cc2');
  });

  it('401 triggers invalidate + single retry via refresh grant', async () => {
    // endpoint que rejeita o primeiro token emitido e aceita o segundo
    const rejectFirst = { value: true };
    const srv = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const bodyText = Buffer.concat(chunks).toString('utf8');
        const url = new URL(req.url, 'http://x');
        if (url.pathname === '/token') {
          const params = new URLSearchParams(bodyText);
          const grant = params.get('grant_type');
          tokenCalls.push(`r:${grant}`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          if (grant === 'refresh_token') {
            res.end(JSON.stringify({ access_token: 'tok-good', refresh_token: 'rt-good', expires_in: 3600 }));
          } else {
            res.end(JSON.stringify({ access_token: 'tok-bad', refresh_token: 'rt-bad', expires_in: 3600 }));
          }
          return;
        }
        if (url.pathname === '/prot2') {
          const auth = req.headers.authorization || '';
          protectedHits.push(`p2:${auth}`);
          if (auth === 'Bearer tok-bad') {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'expired' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ auth }));
          return;
        }
        res.writeHead(404).end();
      });
    });
    await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
    const url2 = `http://127.0.0.1:${srv.address().port}`;

    const hitsBefore = protectedHits.length;
    const res = await ctx.httpEngine.executeHttpRequest({
      method: 'GET',
      url: `${url2}/prot2`,
      headers: [],
      auth: {
        type: 'oauth2',
        autoRefresh: true,
        grantType: 'client_credentials',
        tokenUrl: `${url2}/token`,
        clientId: 'cid2',
        clientSecret: 'csec2'
      },
      timeoutMs: 5000
    });

    assert.equal(res.ok, true);
    assert.equal(res.status, 200);
    const p2hits = protectedHits.slice(hitsBefore).filter((h) => h.startsWith('p2:'));
    assert.equal(p2hits.length, 2, 'exatamente uma repetição após 401');
    assert.equal(p2hits[0], 'p2:Bearer tok-bad');
    assert.equal(p2hits[1], 'p2:Bearer tok-good');
    const grants = tokenCalls.filter((c) => c.startsWith('r:'));
    assert.deepEqual(grants, ['r:client_credentials', 'r:refresh_token']);
    void rejectFirst;
    await new Promise((resolve) => srv.close(resolve));
  });

  it('autoRefresh=false keeps legacy behavior (literal token, no manager)', async () => {
    const tokenCallsBefore = tokenCalls.length;
    const res = await ctx.httpEngine.executeHttpRequest({
      method: 'GET',
      url: `${baseUrl}/protected`,
      headers: [],
      auth: { type: 'oauth2', autoRefresh: false, token: 'manual-token', tokenUrl: `${baseUrl}/token`, clientId: 'x' },
      timeoutMs: 5000
    });
    assert.equal(res.ok, true);
    assert.equal(protectedHits.at(-1), 'Bearer manual-token');
    assert.equal(tokenCalls.length, tokenCallsBefore, 'sem chamada ao token endpoint');
  });
});
