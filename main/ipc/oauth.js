'use strict';

const { toIpcError } = require('../errors');

function register({ ipcMain, oauthPkce, oauthTokenManager }) {
  ipcMain.handle('pm:oauth:pkce:start', async (_event, cfg) => {
    try {
      return await oauthPkce.start(cfg || {});
    } catch (err) {
      return toIpcError(err);
    }
  });

  ipcMain.handle('pm:oauth:pkce:cancel', async () => {
    return oauthPkce.cancel();
  });

  ipcMain.handle('pm:oauth:token:fetch', async (_event, authCfg) => {
    try {
      if (!oauthTokenManager) return { ok: false, error: { code: 'UNSUPPORTED', message: 'Token Manager indisponível' } };
      const res = await oauthTokenManager.getToken(authCfg || {});
      if (!res || res.ok !== true) {
        return { ok: false, error: res?.error || { code: 'OAUTH_TOKEN_ERROR', message: 'Falha ao obter token' } };
      }
      return { ok: true, accessToken: res.accessToken, expiresAt: res.expiresAt, tokenType: res.tokenType };
    } catch (err) {
      return toIpcError(err);
    }
  });

  ipcMain.handle('pm:oauth:token:status', async (_event, authCfg) => {
    try {
      if (!oauthTokenManager) return { ok: true, cached: false, expiresAt: null, hasRefreshToken: false };
      return oauthTokenManager.status(authCfg || {});
    } catch (err) {
      return toIpcError(err);
    }
  });

  ipcMain.handle('pm:oauth:token:clear', async (_event, authCfg) => {
    try {
      if (!oauthTokenManager) return { ok: false, error: 'Token Manager indisponível' };
      const key = authCfg?.cacheKey || (authCfg && typeof authCfg === 'object' ? oauthTokenManager.cacheKeyFor(authCfg) : null);
      return oauthTokenManager.clear(key || undefined);
    } catch (err) {
      return toIpcError(err);
    }
  });
}

module.exports = register;
