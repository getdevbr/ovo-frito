'use strict';

const { toIpcError } = require('../errors');

function register({ ipcMain, dialog, storage, folderSync, syncDirs }) {
  ipcMain.handle('pm:sync:pickFolder', async () => {
    const res = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    if (res.canceled || !res.filePaths.length) return { ok: false, canceled: true };
    syncDirs.approve(res.filePaths[0]);
    return { ok: true, dirPath: res.filePaths[0] };
  });

  ipcMain.handle('pm:sync:enable', async (_event, cfg) => {
    try {
      if (!syncDirs.isApproved(cfg?.dirPath)) {
        return toIpcError(new Error('Diretório de sincronização não aprovado. Use o seletor de pasta primeiro.'));
      }
      return folderSync.enable(cfg || {});
    } catch (err) {
      return toIpcError(err);
    }
  });

  ipcMain.handle('pm:sync:disable', async (_event, { collectionId } = {}) => {
    return folderSync.disable(collectionId);
  });

  ipcMain.handle('pm:sync:flush', async (_event, { collectionId, dirPath } = {}) => {
    try {
      const collections = storage.readStore('collections') || [];
      const col = collections.find((c) => c.id === collectionId);
      if (!col || !dirPath) return { ok: false, error: { code: 'INVALID_ARGS', message: 'collectionId e dirPath são obrigatórios' } };
      if (!syncDirs.isApproved(dirPath)) {
        return { ok: false, error: { code: 'DIR_NOT_APPROVED', message: 'Diretório de sincronização não aprovado.' } };
      }
      folderSync.flushCollection(col, dirPath);
      return { ok: true };
    } catch (err) {
      return toIpcError(err);
    }
  });

  ipcMain.handle('pm:sync:status', async () => {
    return { ok: true, ...folderSync.status() };
  });
}

module.exports = register;
