'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createStorage } = require('../../main/storage');
const { createFolderSync, resolveSafePath } = require('../../main/services/folder-sync');

describe('folder-sync integration', () => {
  let dataDir;
  let syncDir;
  let storage;
  let folderSync;

  before(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdo-sync-data-'));
    syncDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdo-sync-dir-'));
    storage = createStorage({ dataDir });
    storage.ensurePortableDataDir();
    storage.writeStore('collections', [
      {
        id: 'col_s',
        name: 'SyncCol',
        items: [{ id: 'req_1234', name: 'Ping', folder: 'Health', method: 'GET', url: 'http://localhost/ping' }]
      }
    ]);
    folderSync = createFolderSync({ storage });
  });

  after(async () => {
    await folderSync.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(syncDir, { recursive: true, force: true });
  });

  it('writes collection.ovo and nested request files, and blocks path traversal', () => {
    folderSync.enable({ collectionId: 'col_s', dirPath: syncDir });
    assert.equal(fs.existsSync(path.join(syncDir, 'collection.ovo')), true);
    assert.equal(fs.existsSync(path.join(syncDir, 'Health', 'ping-1234.ovo')), true);
    assert.throws(() => resolveSafePath(syncDir, '../outside.ovo'), { code: 'PATH_TRAVERSAL' });
  });
});
