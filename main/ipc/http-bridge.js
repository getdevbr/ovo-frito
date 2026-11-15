'use strict';

const { runUserScript, runUserScriptAsync } = require('../script-sandbox');
const { loadAllStores } = require('./storage');

/**
 * Dispatch dos canais IPC suportados no modo web (server-fallback.js).
 * Recebe o contexto de main/bootstrap.js. Canais não suportados retornam null
 * para o caller responder UNSUPPORTED_IN_WEB_MODE.
 */
async function dispatchWebIpc(ctx, channel, payload) {
  const { storage, httpEngine, vault, dbEngine, oauthTokenManager, gitSync } = ctx;

  if (channel === 'pm:storage:loadAll') {
    return loadAllStores(storage, ctx.dataDir);
  }
  if (channel === 'pm:storage:save') {
    return { ok: storage.writeStore(payload.key, payload.data) };
  }
  if (channel === 'pm:runtime:request') {
    return await httpEngine.executeHttpRequest(payload);
  }
  if (channel === 'pm:script:run') {
    const dbConnection = payload?.dbConnection && typeof payload.dbConnection === 'object' ? payload.dbConnection : null;
    const dbExecutor = dbEngine && dbConnection && dbConnection.enabled !== false
      ? async (sql, params) => dbEngine.executeQuery({ connection: dbConnection, query: sql, params, timeoutMs: payload?.timeoutMs || 10000 })
      : null;
    if (dbExecutor || (typeof payload?.code === 'string' && (/\bawait\b/.test(payload.code) || /\bpm\.db\.query\b/.test(payload.code)))) {
      return await runUserScriptAsync({ ...(payload || {}), dbExecutor });
    }
    return runUserScript(payload || {});
  }
  if (channel === 'pm:db:query') {
    return await dbEngine.executeQuery(payload || {});
  }
  if (channel === 'pm:db:testConnection') {
    return await dbEngine.testConnection(payload || {});
  }
  if (channel === 'pm:vault:unlock') {
    return vault.unlock(payload?.password);
  }
  if (channel === 'pm:vault:lock') {
    return vault.lock();
  }
  if (channel === 'pm:vault:status') {
    return vault.status();
  }
  if (channel === 'pm:vault:set') {
    return vault.setSecret(payload?.key, payload?.value);
  }
  if (channel === 'pm:vault:get') {
    return vault.getSecret(payload?.key);
  }
  if (channel === 'pm:vault:delete') {
    return vault.deleteSecret(payload?.key);
  }
  if (channel === 'pm:vault:list') {
    return vault.listKeys();
  }
  if (channel === 'pm:oauth:token:fetch') {
    if (!oauthTokenManager) return { ok: false, error: { code: 'UNSUPPORTED', message: 'Token Manager indisponível' } };
    const res = await oauthTokenManager.getToken(payload || {});
    if (!res || res.ok !== true) {
      return { ok: false, error: res?.error || { code: 'OAUTH_TOKEN_ERROR', message: 'Falha ao obter token' } };
    }
    return { ok: true, accessToken: res.accessToken, expiresAt: res.expiresAt, tokenType: res.tokenType };
  }
  if (channel === 'pm:oauth:token:status') {
    if (!oauthTokenManager) return { ok: true, cached: false, expiresAt: null, hasRefreshToken: false };
    return oauthTokenManager.status(payload || {});
  }
  if (channel === 'pm:oauth:token:clear') {
    if (!oauthTokenManager) return { ok: false, error: 'Token Manager indisponível' };
    const key = payload?.cacheKey || (payload && typeof payload === 'object' ? oauthTokenManager.cacheKeyFor(payload) : null);
    return oauthTokenManager.clear(key || undefined);
  }
  if (channel.startsWith('pm:git:') && gitSync) {
    const p = payload || {};
    const repoId = p.repoId || p.id;
    switch (channel) {
      case 'pm:git:detect': return gitSync.detect();
      case 'pm:git:testConnection': return gitSync.testConnection(p);
      case 'pm:git:connect': return gitSync.connect(p);
      case 'pm:git:list': return { ok: true, repos: gitSync.listRepos() };
      case 'pm:git:status': return gitSync.status(repoId);
      case 'pm:git:pull': return gitSync.pull(repoId);
      case 'pm:git:push': return gitSync.push(repoId);
      case 'pm:git:sync': return gitSync.sync(repoId, { commitMessage: p.commitMessage });
      case 'pm:git:resolveConflict': return gitSync.resolveConflict(repoId, { strategy: p.strategy });
      case 'pm:git:disconnect': return gitSync.disconnect(repoId, { deleteLocalClone: Boolean(p.deleteLocalClone) });
      case 'pm:git:setCredentials': return gitSync.setCredentials(repoId, { username: p.username, password: p.password });
      case 'pm:git:clearCredentials': return gitSync.clearCredentials(repoId);
    }
  }
  return null;
}

module.exports = { dispatchWebIpc };
