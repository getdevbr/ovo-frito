'use strict';

const { runUserScript, runUserScriptAsync } = require('../script-sandbox');

function register({ ipcMain, dbEngine }) {
  ipcMain.handle('pm:script:run', async (_event, payload = {}) => {
    const dbConnection = payload?.dbConnection && typeof payload.dbConnection === 'object' ? payload.dbConnection : null;
    const dbExecutor = dbEngine && dbConnection && dbConnection.enabled !== false
      ? async (sql, params) => dbEngine.executeQuery({ connection: dbConnection, query: sql, params, timeoutMs: payload?.timeoutMs || 10000 })
      : null;

    if (dbExecutor || (typeof payload?.code === 'string' && (/\bawait\b/.test(payload.code) || /\bpm\.db\.query\b/.test(payload.code)))) {
      return await runUserScriptAsync({ ...payload, dbExecutor });
    }
    return runUserScript(payload);
  });
}

module.exports = register;
