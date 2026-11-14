'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createStorage } = require('../../main/storage');
const { createHttpEngine } = require('../../main/http-engine');
const { createLoadRunner } = require('../../main/services/load-runner');

describe('load-runner integration', () => {
  let tmpDir;
  let server;
  let baseUrl;
  let runner;
  let maxConcurrentObserved = 0;
  let currentConcurrent = 0;

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdo-load-'));
    const storage = createStorage({ dataDir: tmpDir });
    storage.ensurePortableDataDir();
    const httpEngine = createHttpEngine({ storage });
    runner = createLoadRunner({ httpEngine });

    server = http.createServer((req, res) => {
      currentConcurrent += 1;
      if (currentConcurrent > maxConcurrentObserved) maxConcurrentObserved = currentConcurrent;
      setTimeout(() => {
        currentConcurrent -= 1;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      }, 15);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await runner.stopAll();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('respects concurrency limit and exact iteration count', async () => {
    maxConcurrentObserved = 0;
    const summary = await runner.start({
      runId: 'r1',
      spec: { method: 'GET', url: `${baseUrl}/test` },
      concurrency: 4,
      iterations: 20
    });

    assert.equal(summary.total, 20);
    assert.equal(summary.succeeded, 20);
    assert.ok(maxConcurrentObserved <= 4, `observed ${maxConcurrentObserved}`);
  });
});
