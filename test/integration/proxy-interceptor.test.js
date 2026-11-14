'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createStorage } = require('../../main/storage');
const { createHttpEngine } = require('../../main/http-engine');
const { createProxyInterceptor } = require('../../main/services/proxy-interceptor');

describe('proxy-interceptor integration', () => {
  let tmpDir;
  let targetServer;
  let targetUrl;
  let engine;
  let proxy;

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdo-cap-'));
    const storage = createStorage({ dataDir: tmpDir });
    storage.ensurePortableDataDir();
    engine = createHttpEngine({ storage });
    proxy = createProxyInterceptor({ httpEngine: engine });

    targetServer = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, path: req.url }));
    });
    await new Promise((resolve) => targetServer.listen(0, '127.0.0.1', resolve));
    targetUrl = `http://127.0.0.1:${targetServer.address().port}`;
  });

  after(async () => {
    await proxy.stop();
    await new Promise((resolve) => targetServer.close(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('captures HTTP traffic routed through the proxy', async () => {
    const info = await proxy.start({ port: 0 });
    assert.equal(info.running, true);

    const res = await engine.executeHttpRequest({
      method: 'GET',
      url: `${targetUrl}/captured`,
      network: {
        proxy: {
          enabled: true,
          protocol: 'http',
          host: info.host,
          port: String(info.port),
          bypass: ''
        }
      }
    });

    assert.equal(res.status, 200);
    assert.equal(JSON.parse(res.body).path, '/captured');

    const captured = proxy.list();
    assert.equal(captured.length, 1);
    assert.equal(captured[0].method, 'GET');
    assert.equal(captured[0].status, 200);
  });
});
