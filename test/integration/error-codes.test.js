'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createStorage } = require('../../main/storage');
const { createCookieJar } = require('../../main/cookie-jar');
const { createHttpEngine } = require('../../main/http-engine');
const { createVault } = require('../../main/vault');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

describe('error-codes normalization', { timeout: 30000 }, () => {
  let tmpDir, engine;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdo-err-'));
    const storage = createStorage({ dataDir: tmpDir });
    storage.ensurePortableDataDir();
    engine = createHttpEngine({ storage, cookieJar: createCookieJar(storage), vault: createVault({ storage }) });
  });

  after(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('closed port returns ECONNREFUSED with structured error', async () => {
    const res = await engine.executeHttpRequest({ method: 'GET', url: 'http://127.0.0.1:1/', timeoutMs: 5000 });
    assert.equal(res.ok, false);
    assert.equal(res.error.code, 'ECONNREFUSED');
    assert.ok(res.error.message);
  });

  it('.invalid host returns ENOTFOUND or EAI_AGAIN', async () => {
    const res = await engine.executeHttpRequest({ method: 'GET', url: 'http://nao-existe.invalid/', timeoutMs: 10000 });
    assert.equal(res.ok, false);
    assert.match(res.error.code, /ENOTFOUND|EAI_AGAIN/);
  });

  it('invalid URL returns INVALID_URL', async () => {
    const res = await engine.executeHttpRequest({ method: 'GET', url: 'http://[::1' });
    assert.equal(res.ok, false);
    assert.equal(res.error.code, 'INVALID_URL');
    assert.equal(res.statusText, 'Invalid URL');
  });
});
