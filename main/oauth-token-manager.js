'use strict';

const crypto = require('node:crypto');

const EXPIRY_MARGIN_MS = 30000;
const DEFAULT_EXPIRES_IN_S = 3600;
const VAULT_PREFIX = 'oauth:';

function cacheKeyFor(authCfg = {}) {
  const raw = [
    authCfg.grantType || 'client_credentials',
    authCfg.tokenUrl || '',
    authCfg.clientId || '',
    authCfg.scopes || authCfg.scope || '',
    authCfg.username || '',
    authCfg.audience || ''
  ].join('|');
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function vaultKeyFor(cacheKey) {
  return `${VAULT_PREFIX}${cacheKey}`;
}

function createOAuthTokenManager({ httpEngine, vault, broadcast = () => {}, now = Date.now } = {}) {
  const cache = new Map();

  function vaultUnlocked() {
    try {
      return Boolean(vault && vault.status && vault.status().unlocked);
    } catch {
      return false;
    }
  }

  function persistEntry(cacheKey, entry) {
    if (!vaultUnlocked()) return;
    try {
      vault.setSecret(vaultKeyFor(cacheKey), JSON.stringify({
        accessToken: entry.accessToken,
        refreshToken: entry.refreshToken || '',
        expiresAt: entry.expiresAt,
        tokenType: entry.tokenType || 'Bearer',
        scope: entry.scope || ''
      }));
    } catch {}
  }

  function loadEntryFromVault(cacheKey) {
    if (!vaultUnlocked()) return null;
    try {
      const res = vault.getSecret(vaultKeyFor(cacheKey));
      if (!res || res.ok !== true) return null;
      const parsed = JSON.parse(res.value);
      if (!parsed || typeof parsed !== 'object') return null;
      return {
        accessToken: parsed.accessToken || '',
        refreshToken: parsed.refreshToken || '',
        expiresAt: Number(parsed.expiresAt) || 0,
        tokenType: parsed.tokenType || 'Bearer',
        scope: parsed.scope || ''
      };
    } catch {
      return null;
    }
  }

  function tokenEndpointRequest(tokenUrl, params) {
    return httpEngine.executeHttpRequest({
      method: 'POST',
      url: tokenUrl,
      headers: [
        { key: 'Content-Type', value: 'application/x-www-form-urlencoded', enabled: true },
        { key: 'Accept', value: 'application/json', enabled: true }
      ],
      body: {
        mode: 'urlencoded',
        urlencoded: Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== null && v !== '')
          .map(([key, value]) => ({ key, value: String(value), enabled: true }))
      },
      timeoutMs: 30000
    });
  }

  async function requestToken(authCfg, params) {
    const res = await tokenEndpointRequest(authCfg.tokenUrl, params);
    if (!res || res.ok !== true) {
      const err = res?.error;
      const message = typeof err === 'string' ? err : err?.message || res?.statusText || 'Falha no endpoint de token';
      const code = typeof err === 'object' && err?.code ? err.code : 'OAUTH_TOKEN_ERROR';
      return { ok: false, error: { code, message } };
    }
    let json = null;
    try {
      json = JSON.parse(res.body || '{}');
    } catch {
      return { ok: false, error: { code: 'OAUTH_TOKEN_ERROR', message: 'Resposta do token endpoint não é JSON válido' } };
    }
    if (json && json.error) {
      return {
        ok: false,
        error: {
          code: json.error === 'invalid_grant' ? 'invalid_grant' : 'OAUTH_TOKEN_ERROR',
          message: json.error_description || json.error,
          oauthError: json.error
        }
      };
    }
    if (!json || !json.access_token) {
      return { ok: false, error: { code: 'OAUTH_TOKEN_ERROR', message: 'Token endpoint não retornou access_token' } };
    }
    return { ok: true, tokens: json };
  }

  function storeTokens(authCfg, tokenResponse) {
    const cacheKey = cacheKeyFor(authCfg);
    const prev = cache.get(cacheKey) || loadEntryFromVault(cacheKey) || {};
    const expiresIn = Number(tokenResponse.expires_in);
    const entry = {
      accessToken: String(tokenResponse.access_token || ''),
      refreshToken: tokenResponse.refresh_token ? String(tokenResponse.refresh_token) : (prev.refreshToken || ''),
      expiresAt: now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : DEFAULT_EXPIRES_IN_S) * 1000,
      tokenType: tokenResponse.token_type || prev.tokenType || 'Bearer',
      scope: tokenResponse.scope || prev.scope || ''
    };
    cache.set(cacheKey, entry);
    persistEntry(cacheKey, entry);
    try {
      broadcast('pm:oauth:token:refreshed', { cacheKey, expiresAt: entry.expiresAt });
    } catch {}
    return entry;
  }

  function baseGrantParams(authCfg) {
    return {
      client_id: authCfg.clientId,
      client_secret: authCfg.clientSecret,
      scope: authCfg.scopes || authCfg.scope
    };
  }

  async function runOriginalGrant(authCfg) {
    const grantType = authCfg.grantType || 'client_credentials';
    if (grantType === 'password') {
      return requestToken(authCfg, {
        grant_type: 'password',
        username: authCfg.username,
        password: authCfg.password,
        ...baseGrantParams(authCfg)
      });
    }
    if (grantType === 'authorization_code') {
      return { ok: false, error: { code: 'OAUTH_REAUTH_REQUIRED', message: 'É necessário autorizar via PKCE novamente' } };
    }
    return requestToken(authCfg, { grant_type: 'client_credentials', ...baseGrantParams(authCfg) });
  }

  async function refreshGrant(authCfg, refreshToken) {
    return requestToken(authCfg, {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      ...baseGrantParams(authCfg)
    });
  }

  async function doGetToken(authCfg, { forceRefresh = false } = {}) {
    const cacheKey = cacheKeyFor(authCfg);
    let entry = cache.get(cacheKey);
    if (!entry) {
      const fromVault = loadEntryFromVault(cacheKey);
      if (fromVault) {
        entry = fromVault;
        cache.set(cacheKey, entry);
      }
    }

    if (!forceRefresh && entry && entry.accessToken && entry.expiresAt - now() > EXPIRY_MARGIN_MS) {
      return { ok: true, accessToken: entry.accessToken, expiresAt: entry.expiresAt, tokenType: entry.tokenType };
    }

    if (entry?.refreshToken) {
      const refreshed = await refreshGrant(authCfg, entry.refreshToken);
      if (refreshed.ok) {
        const stored = storeTokens(authCfg, refreshed.tokens);
        return { ok: true, accessToken: stored.accessToken, expiresAt: stored.expiresAt, tokenType: stored.tokenType };
      }
      if (refreshed.error?.code !== 'invalid_grant' && refreshed.error?.oauthError !== 'invalid_grant') {
        return { ok: false, error: refreshed.error };
      }
      // invalid_grant → cai para o grant original abaixo
    }

    const grantRes = await runOriginalGrant(authCfg);
    if (!grantRes.ok) return { ok: false, error: grantRes.error };
    const stored = storeTokens(authCfg, grantRes.tokens);
    return { ok: true, accessToken: stored.accessToken, expiresAt: stored.expiresAt, tokenType: stored.tokenType };
  }

  function getToken(authCfg, options = {}) {
    const cacheKey = cacheKeyFor(authCfg);
    let entry = cache.get(cacheKey);
    if (!entry) {
      const fromVault = loadEntryFromVault(cacheKey);
      if (fromVault) {
        entry = fromVault;
        cache.set(cacheKey, entry);
      }
    }
    if (entry?.pending) return entry.pending;

    const promise = doGetToken(authCfg, options);
    cache.set(cacheKey, { ...(entry || {}), pending: promise });
    return promise.finally(() => {
      const cur = cache.get(cacheKey);
      if (cur && cur.pending === promise) {
        cache.set(cacheKey, {
          accessToken: cur.accessToken || entry?.accessToken || '',
          refreshToken: cur.refreshToken || entry?.refreshToken || '',
          expiresAt: cur.expiresAt || entry?.expiresAt || 0,
          tokenType: cur.tokenType || entry?.tokenType || 'Bearer',
          scope: cur.scope || entry?.scope || ''
        });
      }
    });
  }

  function invalidate(authCfg) {
    const cacheKey = cacheKeyFor(authCfg);
    const entry = cache.get(cacheKey);
    if (entry) {
      entry.accessToken = '';
      entry.expiresAt = 0;
    }
  }

  function clear(cacheKey) {
    if (cacheKey) {
      cache.delete(cacheKey);
      if (vaultUnlocked()) {
        try { vault.deleteSecret(vaultKeyFor(cacheKey)); } catch {}
      }
      return { ok: true };
    }
    cache.clear();
    return { ok: true };
  }

  function status(authCfg) {
    const cacheKey = cacheKeyFor(authCfg);
    const entry = cache.get(cacheKey) || loadEntryFromVault(cacheKey);
    if (!entry) return { ok: true, cached: false, expiresAt: null, hasRefreshToken: false };
    return {
      ok: true,
      cached: Boolean(entry.accessToken),
      expiresAt: entry.expiresAt || null,
      hasRefreshToken: Boolean(entry.refreshToken)
    };
  }

  function stop() {
    cache.clear();
  }

  return { getToken, storeTokens, invalidate, clear, status, stop, cacheKeyFor };
}

module.exports = { createOAuthTokenManager, cacheKeyFor };
