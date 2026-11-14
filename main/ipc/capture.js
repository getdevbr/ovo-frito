'use strict';

const { toIpcError } = require('../errors');

function register({ ipcMain, proxyInterceptor }) {
  ipcMain.handle('pm:capture:start', async (_event, cfg) => {
    try {
      return { ok: true, ...(await proxyInterceptor.start(cfg || {})) };
    } catch (err) {
      return toIpcError(err);
    }
  });

  ipcMain.handle('pm:capture:stop', async () => {
    return await proxyInterceptor.stop();
  });

  ipcMain.handle('pm:capture:clear', async () => {
    proxyInterceptor.clear();
    return { ok: true };
  });

  ipcMain.handle('pm:capture:list', async () => {
    return { ok: true, entries: proxyInterceptor.list() };
  });
}

module.exports = register;
