'use strict';

const { toIpcError } = require('../errors');

function register({ ipcMain, mockServer }) {
  ipcMain.handle('pm:mock:start', async (_event, cfg) => {
    try {
      return { ok: true, ...(await mockServer.start(cfg || {})) };
    } catch (err) {
      return toIpcError(err);
    }
  });

  ipcMain.handle('pm:mock:stop', async () => {
    return await mockServer.stop();
  });

  ipcMain.handle('pm:mock:status', async () => {
    return { ok: true, ...mockServer.status() };
  });
}

module.exports = register;
