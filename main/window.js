'use strict';

const path = require('node:path');
const { BrowserWindow, shell } = require('electron');

const RENDERER_DIR = path.join(__dirname, '..', 'renderer');

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 900,
    minHeight: 560,
    title: 'Ovo Frito — 100% Local-First API Client (.ovo)',
    icon: path.join(RENDERER_DIR, 'egg.png'),
    backgroundColor: '#1C1C1C',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const target = new URL(url);
      if (target.protocol !== 'file:') {
        event.preventDefault();
      }
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.loadFile(path.join(RENDERER_DIR, 'index.html'));
  return mainWindow;
}

function safeOpenExternal(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl));
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return Promise.resolve();
    }
    return shell.openExternal(parsed.toString());
  } catch {
    return Promise.resolve();
  }
}

module.exports = { createMainWindow, safeOpenExternal };
