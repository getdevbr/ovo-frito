'use strict';

const { toIpcError } = require('../errors');

function register({ ipcMain, oauthPkce }) {
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
}

module.exports = register;
