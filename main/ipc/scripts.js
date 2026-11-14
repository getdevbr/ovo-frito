'use strict';

const { runUserScript } = require('../script-sandbox');

function register({ ipcMain }) {
  ipcMain.handle('pm:script:run', async (_event, payload = {}) => {
    return runUserScript(payload);
  });
}

module.exports = register;
