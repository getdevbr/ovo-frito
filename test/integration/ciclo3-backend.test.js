'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAppContext } = require('../../main/bootstrap');
const { exportBackup, parseAndPreviewBackup, restoreBackup } = require('../../main/services/backup');

describe('redirects, dynamic mock, and backup integration (U-23, U-27, FUT-09)', () => {
  it('U-23: follows redirects when enabled and stops when disabled', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdo-redir-'));
    const server = http.createServer((req, res) => {
      if (req.url === '/start') {
        res.writeHead(302, { Location: '/final' });
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ arrived: true }));
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address();
    const ctx = createAppContext({ dataDir: tmpDir });

    try {
      const noFollow = await ctx.httpEngine.executeHttpRequest({
        method: 'GET',
        url: `http://127.0.0.1:${port}/start`,
        followRedirects: false
      });
      assert.equal(noFollow.status, 302);
      assert.equal(noFollow.headers.location, '/final');
      assert.equal(noFollow.redirectHops.length, 0);

      const followed = await ctx.httpEngine.executeHttpRequest({
        method: 'GET',
        url: `http://127.0.0.1:${port}/start`,
        followRedirects: true
      });
      assert.equal(followed.status, 200);
      assert.equal(JSON.parse(followed.body).arrived, true);
      assert.equal(followed.redirectHops.length, 1);
      assert.equal(followed.redirectHops[0].status, 302);
    } finally {
      await ctx.serviceManager.stopAll();
      await new Promise((r) => server.close(r));
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('FUT-09: mock server interpolates request params/query and supports stateful CRUD', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdo-mock-dyn-'));
    const ctx = createAppContext({ dataDir: tmpDir });
    ctx.storage.writeStore('collections', [
      {
        id: 'col_dyn',
        name: 'DynMock',
        items: [
          {
            id: 'r1',
            name: 'Get User',
            method: 'GET',
            url: 'http://localhost/users/:id',
            mockExamples: [
              { name: 'ok', isDefault: true, status: 200, body: '{"id":"{{request.params.id}}","q":"{{request.query.role}}"}' }
            ]
          }
        ]
      }
    ]);

    try {
      const info = await ctx.mockServer.start({ collectionId: 'col_dyn', port: 0, stateful: true });
      const resDyn = await fetch(`${info.url}/users/42?role=admin`);
      assert.equal(resDyn.status, 200);
      assert.deepEqual(await resDyn.json(), { id: '42', q: 'admin' });

      const postRes = await fetch(`${info.url}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Widget' })
      });
      assert.equal(postRes.status, 201);
      const created = await postRes.json();
      assert.ok(created.id);

      const listRes = await fetch(`${info.url}/items`);
      assert.equal(listRes.status, 200);
      const list = await listRes.json();
      assert.equal(list.length, 1);
      assert.equal(list[0].name, 'Widget');
    } finally {
      await ctx.serviceManager.stopAll();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('U-27: exports sanitized backup with encrypted vault and restores into clean dataDir', async () => {
    const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'cdo-bak-a-'));
    const dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'cdo-bak-b-'));
    const ctxA = createAppContext({ dataDir: dirA });
    const ctxB = createAppContext({ dataDir: dirB });

    try {
      ctxA.vault.unlock('master123');
      ctxA.vault.setSecret('api_key', 'super-secret-value');
      ctxA.storage.writeStore('collections', [
        { id: 'c1', name: 'Prod API', auth: { type: 'bearer', token: 'plain-token' }, variables: [{ key: 'sec', value: 'hidden', secret: true }], items: [] }
      ]);

      const bak = exportBackup({ storage: ctxA.storage, dataDir: dirA });
      assert.equal(bak.format, 'ovo-frito-backup/v1');
      assert.equal(bak.collections[0].auth.token, '');
      assert.equal(bak.collections[0].variables[0].value, '');
      assert.ok(bak.vaultEncrypted);
      assert.ok(!JSON.stringify(bak).includes('super-secret-value'));

      const preview = parseAndPreviewBackup(bak);
      assert.equal(preview.collectionsCount, 1);
      assert.equal(preview.hasVault, true);

      const restored = restoreBackup({ storage: ctxB.storage, dataDir: dirB, vault: ctxB.vault, rawInput: bak, mode: 'replace' });
      assert.equal(restored.ok, true);
      assert.equal(restored.vaultRestored, true);

      assert.equal(ctxB.vault.unlock('master123').ok, true);
      assert.equal(ctxB.vault.getSecret('api_key').value, 'super-secret-value');
    } finally {
      await ctxA.serviceManager.stopAll();
      await ctxB.serviceManager.stopAll();
      fs.rmSync(dirA, { recursive: true, force: true });
      fs.rmSync(dirB, { recursive: true, force: true });
    }
  });
});
