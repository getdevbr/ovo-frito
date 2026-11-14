const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { createAppContext } = require('./main/bootstrap');
const { registerAllIpcHandlers } = require('./main/ipc');
const { createMainWindow, safeOpenExternal } = require('./main/window');

const BASE_DIR = app.isPackaged
  ? (process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(app.getPath('exe')))
  : __dirname;

const DATA_DIR = process.env.CDO_DATA_DIR
  ? path.resolve(process.env.CDO_DATA_DIR)
  : path.join(BASE_DIR, 'data');

function ensurePortableUserData(dataDir) {
  const electronUserData = path.join(dataDir, 'userData');
  if (!fs.existsSync(electronUserData)) {
    fs.mkdirSync(electronUserData, { recursive: true });
  }
  app.setPath('userData', electronUserData);
}

function broadcastIpc(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

const ctx = createAppContext({
  dataDir: DATA_DIR,
  broadcast: broadcastIpc,
  openExternal: (url) => safeOpenExternal(url)
});
ctx.storage.ensurePortableDataDir();
ensurePortableUserData(DATA_DIR);

process.on('unhandledRejection', (reason) => {
  console.error('[main] unhandledRejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[main] uncaughtException:', err);
});

app.whenReady().then(() => {
  registerAllIpcHandlers({ ipcMain, dialog, ...ctx });
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

let shuttingDown = false;

app.on('before-quit', (event) => {
  if (shuttingDown) return;
  shuttingDown = true;
  event.preventDefault();
  const forceQuit = setTimeout(() => app.exit(0), 6000);
  forceQuit.unref?.();
  Promise.resolve(ctx.serviceManager.stopAll(3000))
    .catch((err) => console.error('[main] erro ao parar serviços:', err))
    .finally(() => {
      clearTimeout(forceQuit);
      app.exit(0);
    });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
