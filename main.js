const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { createStorage } = require('./main/storage');
const { createCookieJar } = require('./main/cookie-jar');
const { createHttpEngine } = require('./main/http-engine');
const { ServiceManager } = require('./main/services/ServiceManager');
const { createMockServer } = require('./main/services/mock-server');
const { createLoadRunner } = require('./main/services/load-runner');
const { createFolderSync } = require('./main/services/folder-sync');
const { createProxyInterceptor } = require('./main/services/proxy-interceptor');
const { toIpcError } = require('./main/errors');

const BASE_DIR = app.isPackaged
  ? (process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(app.getPath('exe')))
  : __dirname;

const DATA_DIR = process.env.CDO_DATA_DIR
  ? path.resolve(process.env.CDO_DATA_DIR)
  : path.join(BASE_DIR, 'data');

const storage = createStorage({ dataDir: DATA_DIR });
const cookieJar = createCookieJar(storage);
const httpEngine = createHttpEngine({ storage, cookieJar });
const serviceManager = new ServiceManager();
const mockServer = createMockServer({ storage });
const loadRunner = createLoadRunner({ httpEngine });
const folderSync = createFolderSync({ storage });
const proxyInterceptor = createProxyInterceptor({ httpEngine });
serviceManager.register('mock', mockServer);
serviceManager.register('load', { stop: () => loadRunner.stopAll(), status: () => loadRunner.status() });
serviceManager.register('sync', folderSync);
serviceManager.register('capture', proxyInterceptor);

process.on('unhandledRejection', (reason) => {
  console.error('[main] unhandledRejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[main] uncaughtException:', err);
});

function ensurePortableUserData() {
  storage.ensurePortableDataDir();
  const electronUserData = path.join(DATA_DIR, 'userData');
  if (!fs.existsSync(electronUserData)) {
    fs.mkdirSync(electronUserData, { recursive: true });
  }
  app.setPath('userData', electronUserData);
}

function registerIpcHandlers() {
  ipcMain.handle('pm:storage:loadAll', async () => {
    return {
      collections: storage.readStore('collections') || [],
      environments: storage.readStore('environments') || [],
      history: storage.readStore('history') || [],
      settings: storage.readStore('settings') || { theme: 'dark', activeEnvironmentId: '' },
      sessions: storage.readStore('sessions') || { tabs: [], activeTabId: null, responseCache: {} },
      cookies: storage.readStore('cookies') || [],
      dataDir: DATA_DIR
    };
  });

  ipcMain.handle('pm:storage:save', async (_event, { key, data }) => {
    return { ok: storage.writeStore(key, data) };
  });

  ipcMain.handle('pm:runtime:request', async (_event, requestSpec) => {
    return await httpEngine.executeHttpRequest(requestSpec);
  });

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

  ipcMain.handle('pm:load:start', async (event, cfg) => {
    try {
      const summary = await loadRunner.start({
        ...(cfg || {}),
        onProgress: (snap) => {
          if (!event.sender.isDestroyed()) event.sender.send('pm:load:progress', snap);
        }
      });
      return { ok: true, ...summary };
    } catch (err) {
      return toIpcError(err);
    }
  });

  ipcMain.handle('pm:load:stop', async (_event, { runId } = {}) => {
    return { ok: loadRunner.stop(runId) };
  });

  ipcMain.handle('pm:sync:pickFolder', async () => {
    const res = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    if (res.canceled || !res.filePaths.length) return { ok: false, canceled: true };
    return { ok: true, dirPath: res.filePaths[0] };
  });

  ipcMain.handle('pm:sync:enable', async (_event, cfg) => {
    try {
      return folderSync.enable(cfg || {});
    } catch (err) {
      return toIpcError(err);
    }
  });

  ipcMain.handle('pm:sync:disable', async (_event, { collectionId } = {}) => {
    return folderSync.disable(collectionId);
  });

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

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 900,
    minHeight: 560,
    title: 'Carro do Ovo — 100% Local-First API Client (.ovo)',
    icon: path.join(__dirname, 'renderer', 'egg.png'),
    backgroundColor: '#1C1C1C',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

ensurePortableUserData();

app.whenReady().then(() => {
  registerIpcHandlers();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('before-quit', async (event) => {
  if (serviceManager.services.size > 0) {
    event.preventDefault();
    await serviceManager.stopAll(3000);
    app.exit(0);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
