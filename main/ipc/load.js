'use strict';

const { toIpcError } = require('../errors');

function register({ ipcMain, loadRunner, broadcast }) {
  ipcMain.handle('pm:load:start', async (_event, cfg = {}) => {
    try {
      const runId = cfg.runId || `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const done = loadRunner.start({
        ...(cfg || {}),
        runId,
        onProgress: (snap) => broadcast('pm:load:progress', snap)
      });
      Promise.resolve(done)
        .then((summary) => broadcast('pm:load:done', { ok: true, ...summary }))
        .catch((err) => broadcast('pm:load:done', { ok: false, runId, error: err?.message || String(err) }));
      return { ok: true, runId };
    } catch (err) {
      return toIpcError(err);
    }
  });

  ipcMain.handle('pm:load:stop', async (_event, { runId } = {}) => {
    return { ok: loadRunner.stop(runId) };
  });
}

module.exports = register;
