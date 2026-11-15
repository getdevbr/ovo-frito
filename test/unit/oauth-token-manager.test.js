'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createOAuthTokenManager, cacheKeyFor } = require('../../main/oauth-token-manager');
const { createVault } = require('../../main/vault');

function makeEngine(handlers = {}) {
  const calls = [];
  return {
    calls,
    async executeHttpRequest(spec) {
      calls.push(spec);
      const grant = spec.body?.urlencoded?.find((p) => p.key === 'grant_type')?.value;
      const handler = handlers[grant] || handlers.default;
      if (handler) return handler(spec, calls.length);
      return { ok: false, error: `no handler for ${grant}`, status: 0 };
    }
  };
}

function tokenOk(accessToken, extra = {}) {
  return {
    ok: true,
    status: 200,
    body: JSON.stringify({ access_token: accessToken, token_type: 'Bearer', expires_in: 3600, ...extra })
  };
}

function makeManager({ engine, vault, nowRef, broadcasts }) {
  return createOAuthTokenManager({
    httpEngine: engine,
    vault: vault || null,
    broadcast: (ch, p) => broadcasts?.push([ch, p]),
    now: nowRef ? () => nowRef.t : Date.now
  });
}

const baseAuth = {
  type: 'oauth2',
  grantType: 'client_credentials',
  tokenUrl: 'http://token.local/oauth/token',
  clientId: 'cid',
  clientSecret: 'csec',
  scopes: 'read'
};

describe('oauth-token-manager', () => {
  it('fetches client_credentials token and caches it', async () => {
    const engine = makeEngine({ client_credentials: () => tokenOk('tok-1') });
    const mgr = makeManager({ engine });
    const r1 = await mgr.getToken(baseAuth);
    assert.equal(r1.ok, true);
    assert.equal(r1.accessToken, 'tok-1');
    const r2 = await mgr.getToken(baseAuth);
    assert.equal(r2.accessToken, 'tok-1');
    assert.equal(engine.calls.length, 1, 'segunda chamada deve usar cache');
  });

  it('refreshes when within 30s of expiry and rotates refresh_token', async () => {
    const nowRef = { t: 1000000 };
    const engine = makeEngine({
      client_credentials: (spec) => tokenOk('tok-1', { expires_in: 60, refresh_token: 'rt-1' }),
      refresh_token: (spec) => {
        const rt = spec.body.urlencoded.find((p) => p.key === 'refresh_token')?.value;
        return tokenOk(rt === 'rt-1' ? 'tok-2' : 'tok-3', { expires_in: 60, refresh_token: rt === 'rt-1' ? 'rt-new' : 'rt-newer' });
      }
    });
    const mgr = makeManager({ engine, nowRef });
    const first = await mgr.getToken(baseAuth);
    assert.equal(first.accessToken, 'tok-1');
    nowRef.t += 40 * 1000; // faltam 20s → dentro da margem de 30s
    const second = await mgr.getToken(baseAuth);
    assert.equal(second.accessToken, 'tok-2');
    const refreshCall = engine.calls.find((c) => c.body.urlencoded.some((p) => p.key === 'refresh_token' && p.value === 'rt-1'));
    assert.ok(refreshCall, 'deve ter usado grant refresh_token com rt-1');
    // rotação: próximo refresh usa rt-new
    nowRef.t += 40 * 1000;
    const third = await mgr.getToken(baseAuth);
    assert.equal(third.accessToken, 'tok-3');
    const rotated = engine.calls.filter((c) => c.body.urlencoded.some((p) => p.key === 'refresh_token' && p.value === 'rt-new'));
    assert.equal(rotated.length, 1);
  });

  it('single-flight: concurrent getToken shares one token request', async () => {
    let resolveReq;
    const engine = makeEngine({
      client_credentials: () => new Promise((res) => { resolveReq = () => res(tokenOk('tok-x')); })
    });
    // engine.executeHttpRequest is async; wrap to delay
    const slowEngine = {
      calls: engine.calls,
      executeHttpRequest(spec) {
        engine.calls.push(spec);
        return new Promise((res) => setTimeout(() => res(tokenOk('tok-x')), 20));
      }
    };
    const mgr = makeManager({ engine: slowEngine });
    const results = await Promise.all([mgr.getToken(baseAuth), mgr.getToken(baseAuth), mgr.getToken(baseAuth)]);
    assert.ok(results.every((r) => r.ok && r.accessToken === 'tok-x'));
    assert.equal(slowEngine.calls.length, 1);
    void resolveReq;
  });

  it('falls back to original grant on invalid_grant', async () => {
    const engine = makeEngine({
      client_credentials: () => tokenOk('tok-fresh', { refresh_token: 'rt-9' }),
      refresh_token: () => ({ ok: true, status: 400, body: JSON.stringify({ error: 'invalid_grant' }) })
    });
    const nowRef = { t: 0 };
    const mgr = makeManager({ engine, nowRef });
    // semeia entrada com refresh token
    mgr.storeTokens(baseAuth, { access_token: 'old', refresh_token: 'rt-old', expires_in: 1 });
    nowRef.t = 5000; // expirado
    const res = await mgr.getToken(baseAuth);
    assert.equal(res.ok, true);
    assert.equal(res.accessToken, 'tok-fresh');
  });

  it('authorization_code without refresh returns OAUTH_REAUTH_REQUIRED', async () => {
    const pkceAuth = { ...baseAuth, grantType: 'authorization_code' };
    const engine = makeEngine({});
    const mgr = makeManager({ engine });
    mgr.storeTokens(pkceAuth, { access_token: 'at', expires_in: 1 }); // sem refresh_token
    await new Promise((r) => setTimeout(r, 5));
    const res = await mgr.getToken(pkceAuth, { forceRefresh: true });
    assert.equal(res.ok, false);
    assert.equal(res.error.code, 'OAUTH_REAUTH_REQUIRED');
  });

  it('defaults to 3600s when expires_in missing', async () => {
    const nowRef = { t: 0 };
    const engine = makeEngine({ client_credentials: () => ({ ok: true, status: 200, body: JSON.stringify({ access_token: 'tok' }) }) });
    const mgr = makeManager({ engine, nowRef });
    const res = await mgr.getToken(baseAuth);
    assert.equal(res.expiresAt, 3600 * 1000);
  });

  it('persists tokens in vault when unlocked and reloads after restart', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdo-oauth-'));
    const vault = createVault({ storage: { dataDir: dir } });
    vault.unlock('pw');
    const engine = makeEngine({ client_credentials: () => tokenOk('tok-v', { refresh_token: 'rt-v' }) });
    const mgr1 = makeManager({ engine, vault });
    await mgr1.getToken(baseAuth);

    const mgr2 = makeManager({ engine, vault }); // "restart": nova instância, mesmo cofre
    engine.calls.length = 0;
    const res = await mgr2.getToken(baseAuth);
    assert.equal(res.ok, true);
    assert.equal(res.accessToken, 'tok-v');
    assert.equal(engine.calls.length, 0, 'token do cofre deve ser usado sem nova chamada');
    // refresh_token nunca deve ser exposto: getToken retorna só accessToken/expiresAt
    assert.equal(res.refreshToken, undefined);
  });

  it('keeps tokens only in memory when vault is locked', async () => {
    const engine = makeEngine({ client_credentials: () => tokenOk('tok-m') });
    const vault = createVault({ storage: { dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'cdo-oauth-')) } }); // locked
    const mgr = makeManager({ engine, vault });
    const res = await mgr.getToken(baseAuth);
    assert.equal(res.ok, true);
    assert.equal(vault.listKeys().ok, false);
  });

  it('emits pm:oauth:token:refreshed without token material', async () => {
    const broadcasts = [];
    const engine = makeEngine({ client_credentials: () => tokenOk('tok-b', { refresh_token: 'rt-secret' }) });
    const mgr = makeManager({ engine, broadcasts });
    await mgr.getToken(baseAuth);
    assert.equal(broadcasts.length, 1);
    assert.equal(broadcasts[0][0], 'pm:oauth:token:refreshed');
    const payload = JSON.stringify(broadcasts[0][1]);
    assert.ok(!payload.includes('tok-b'));
    assert.ok(!payload.includes('rt-secret'));
  });

  it('password grant sends username/password', async () => {
    const engine = makeEngine({ password: () => tokenOk('tok-p') });
    const mgr = makeManager({ engine });
    const res = await mgr.getToken({ ...baseAuth, grantType: 'password', username: 'u1', password: 'p1' });
    assert.equal(res.ok, true);
    const params = engine.calls[0].body.urlencoded;
    assert.ok(params.some((p) => p.key === 'grant_type' && p.value === 'password'));
    assert.ok(params.some((p) => p.key === 'username' && p.value === 'u1'));
    assert.ok(params.some((p) => p.key === 'password' && p.value === 'p1'));
  });

  it('cacheKeyFor is stable and excludes secrets', () => {
    const k1 = cacheKeyFor(baseAuth);
    const k2 = cacheKeyFor({ ...baseAuth, clientSecret: 'different-secret' });
    assert.equal(k1, k2);
    assert.match(k1, /^[a-f0-9]{64}$/);
  });
});
