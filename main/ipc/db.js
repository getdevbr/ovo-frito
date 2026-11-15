'use strict';

function register({ ipcMain, dbEngine }) {
  ipcMain.handle('pm:db:query', async (_event, payload = {}) => {
    return await dbEngine.executeQuery(payload);
  });

  ipcMain.handle('pm:db:testConnection', async (_event, payload = {}) => {
    return await dbEngine.testConnection(payload);
  });
}

module.exports = register;
