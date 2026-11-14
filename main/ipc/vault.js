'use strict';

function register({ ipcMain, vault }) {
  ipcMain.handle('pm:vault:unlock', async (_event, { password } = {}) => {
    return vault.unlock(password);
  });

  ipcMain.handle('pm:vault:lock', async () => {
    return vault.lock();
  });

  ipcMain.handle('pm:vault:status', async () => {
    return vault.status();
  });

  ipcMain.handle('pm:vault:set', async (_event, { key, value } = {}) => {
    return vault.setSecret(key, value);
  });

  ipcMain.handle('pm:vault:get', async (_event, { key } = {}) => {
    return vault.getSecret(key);
  });

  ipcMain.handle('pm:vault:delete', async (_event, { key } = {}) => {
    return vault.deleteSecret(key);
  });

  ipcMain.handle('pm:vault:list', async () => {
    return vault.listKeys();
  });
}

module.exports = register;
