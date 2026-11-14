'use strict';

const path = require('node:path');

/**
 * Registro de diretórios de Folder Sync explicitamente aprovados pelo usuário
 * (via pm:sync:pickFolder ou já persistidos em collections[].sync.dirPath).
 */
function createSyncDirs({ storage }) {
  const approvedSyncDirs = new Set();

  function approveSyncDir(dirPath) {
    try {
      if (dirPath) approvedSyncDirs.add(path.resolve(String(dirPath)));
    } catch {}
  }

  function isApprovedSyncDir(dirPath) {
    try {
      return approvedSyncDirs.has(path.resolve(String(dirPath)));
    } catch {
      return false;
    }
  }

  function loadFromStorage() {
    const collections = storage.readStore('collections') || [];
    for (const col of collections) {
      approveSyncDir(col?.sync?.dirPath);
    }
  }

  return {
    approve: approveSyncDir,
    isApproved: isApprovedSyncDir,
    loadFromStorage
  };
}

module.exports = { createSyncDirs };
