'use strict';

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

function register({ ipcMain, storage, dataDir }) {
  ipcMain.handle('pm:storage:loadAll', async () => {
    return loadAllStores(storage, dataDir);
  });

  ipcMain.handle('pm:storage:save', async (_event, { key, data }) => {
    return { ok: storage.writeStore(key, data) };
  });
}

module.exports = register;
module.exports.loadAllStores = loadAllStores;
