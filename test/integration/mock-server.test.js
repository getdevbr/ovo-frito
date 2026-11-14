'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createStorage } = require('../../main/storage');
const { createHttpEngine } = require('../../main/http-engine');
const { createMockServer } = require('../../main/services/mock-server');

describe('mock-server integration', () => {
  let tmpDir;
  let storage;
  let engine;
  let mock;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdo-mock-'));
    storage = createStorage({ dataDir: tmpDir });
    storage.ensurePortableDataDir();
    storage.writeStore('collections', [
      {
        id: 'col_m',
        name: 'MockCol',
        items: [
          {
            id: 'req_1',
            name: 'Get User',
            method: 'GET',
            url: '{{base_url}}/users/:id',
            mockExamples: [
              { id: 'ex1', name: 'ok', status: 200, body: '{"id":1,"req":"{{$uuid}}"}', isDefault: true },
              { id: 'ex2', name: 'teapot', status: 418, body: '{"tea":true}' }
            ]
          }
        ]
      }
    ]);
    engine = createHttpEngine({ storage });
    mock = createMockServer({ storage });
  });

  after(async () => {
    await mock.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('serves default example, named example, 404 with routes, and stops cleanly', async () => {
    const info = await mock.start({ collectionId: 'col_m', port: 0 });
    assert.equal(info.running, true);

    const r1 = await engine.executeHttpRequest({ method: 'GET', url: `${info.url}/users/99` });
    assert.equal(r1.status, 200);
    assert.equal(JSON.parse(r1.body).id, 1);

    const r2 = await engine.executeHttpRequest({
      method: 'GET',
      url: `${info.url}/users/99`,
      headers: [{ key: 'x-mock-example', value: 'teapot', enabled: true }]
    });
    assert.equal(r2.status, 418);

    const r404 = await engine.executeHttpRequest({ method: 'GET', url: `${info.url}/unknown` });
    assert.equal(r404.status, 404);
    assert.ok(JSON.parse(r404.body).availableRoutes.length > 0);

    await mock.stop();
    assert.equal(mock.status().running, false);
  });
});
