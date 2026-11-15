'use strict';

const { runUserScript, runUserScriptAsync } = require('../script-sandbox');
const { loadAllStores } = require('./storage');

/**
 * Dispatch dos canais IPC suportados no modo web (server-fallback.js).
 * Recebe o contexto de main/bootstrap.js. Canais não suportados retornam null
 * para o caller responder UNSUPPORTED_IN_WEB_MODE.
 */
async function dispatchWebIpc(ctx, channel, payload) {
  const { storage, httpEngine, vault, dbEngine } = ctx;

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
  return null;
}

module.exports = { dispatchWebIpc };
