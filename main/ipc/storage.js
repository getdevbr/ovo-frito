'use strict';

const { exportBackup, parseAndPreviewBackup, restoreBackup } = require('../services/backup');
const { toIpcError } = require('../errors');

function loadAllStores(storage, dataDir) {
  return {
    collections: storage.readStore('collections') || [],
    profiles: storage.readStore('profiles') || [],
    history: storage.readStore('history') || [],
    settings: storage.readStore('settings') || { theme: 'dark', activeProfileId: '' },
    sessions: storage.readStore('sessions') || { tabs: [], activeTabId: null, responseCache: {} },
    cookies: storage.readStore('cookies') || [],
    trash: storage.readStore('trash') || [],
    dataDir
  };
}

function register({ ipcMain, storage, dataDir, vault }) {
  ipcMain.handle('pm:storage:loadAll', async () => {
    return loadAllStores(storage, dataDir);
  });

  ipcMain.handle('pm:storage:save', async (_event, { key, data }) => {
    return { ok: storage.writeStore(key, data) };
  });

  ipcMain.handle('pm:backup:export', async () => {
    try {
      return { ok: true, backup: exportBackup({ storage, dataDir }) };
    } catch (err) {
      return toIpcError(err);
    }
  });

  ipcMain.handle('pm:backup:preview', async (_event, { raw } = {}) => {
    try {
      return parseAndPreviewBackup(raw);
    } catch (err) {
      return toIpcError(err);
    }
  });

  ipcMain.handle('pm:backup:restore', async (_event, { raw, mode, restoreVault } = {}) => {
    try {
      return restoreBackup({ storage, dataDir, vault, rawInput: raw, mode, restoreVault });
    } catch (err) {
      return toIpcError(err);
    }
  });
}

module.exports = register;
module.exports.loadAllStores = loadAllStores;
