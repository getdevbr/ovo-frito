'use strict';

const { toIpcError } = require('../errors');

function register({ ipcMain, gitSync }) {
  const guard = (fn) => async (_event, payload) => {
    try {
      if (!gitSync) return { ok: false, error: { code: 'UNSUPPORTED', message: 'Git Sync indisponível' } };
      return await fn(payload || {});
    } catch (err) {
      return toIpcError(err);
    }
  };

  ipcMain.handle('pm:git:detect', guard(() => gitSync.detect()));
  ipcMain.handle('pm:git:testConnection', guard((p) => gitSync.testConnection(p)));
  ipcMain.handle('pm:git:connect', guard((p) => gitSync.connect(p)));
  ipcMain.handle('pm:git:list', guard(() => ({ ok: true, repos: gitSync.listRepos() })));
  ipcMain.handle('pm:git:status', guard((p) => gitSync.status(p.repoId || p.id)));
  ipcMain.handle('pm:git:pull', guard((p) => gitSync.pull(p.repoId || p.id)));
  ipcMain.handle('pm:git:push', guard((p) => gitSync.push(p.repoId || p.id)));
  ipcMain.handle('pm:git:sync', guard((p) => gitSync.sync(p.repoId || p.id, { commitMessage: p.commitMessage })));
  ipcMain.handle('pm:git:resolveConflict', guard((p) => gitSync.resolveConflict(p.repoId || p.id, { strategy: p.strategy })));
  ipcMain.handle('pm:git:disconnect', guard((p) => gitSync.disconnect(p.repoId || p.id, { deleteLocalClone: Boolean(p.deleteLocalClone) })));
  ipcMain.handle('pm:git:setCredentials', guard((p) => gitSync.setCredentials(p.repoId || p.id, { username: p.username, password: p.password })));
  ipcMain.handle('pm:git:clearCredentials', guard((p) => gitSync.clearCredentials(p.repoId || p.id)));
}

module.exports = register;
