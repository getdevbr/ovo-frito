'use strict';

function register({ ipcMain, httpEngine }) {
  ipcMain.handle('pm:runtime:request', async (_event, requestSpec) => {
    return await httpEngine.executeHttpRequest(requestSpec);
  });
}

module.exports = register;
