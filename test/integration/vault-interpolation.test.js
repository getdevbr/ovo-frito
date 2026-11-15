'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createAppContext } = require('../../main/bootstrap');

describe('vault interpolation integration', () => {
  let ctx;
  let server;
  let baseUrl;
  let tmpDir;
  let lastHit;

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdo-vault-int-'));
    ctx = createAppContext({ dataDir: tmpDir });

    server = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        lastHit = {
          method: req.method,
          url: req.url,
          headers: req.headers,
          body: Buffer.concat(chunks).toString('utf8')
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(lastHit));
      });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (ctx?.serviceManager) await ctx.serviceManager.stopAll?.().catch(() => {});
  });

  it('sends the real secret and masks it everywhere in the response', async () => {
    ctx.vault.unlock('master-pw');
    ctx.vault.setSecret('api_token', 'SUPER-SECRET-TOKEN-9f8e');

    const res = await ctx.httpEngine.executeHttpRequest({
      method: 'POST',
      url: `${baseUrl}/echo?token={{vault.api_token}}`,
      headers: [{ key: 'Authorization', value: 'Bearer {{vault.api_token}}', enabled: true }],
      body: { mode: 'raw', raw: 'echo={{vault.api_token}}' },
      timeoutMs: 5000
    });

    assert.equal(res.ok, true);
    // O servidor recebeu o segredo real (body da resposta vem mascarado)
    assert.equal(lastHit.headers.authorization, 'Bearer SUPER-SECRET-TOKEN-9f8e');
    assert.equal(lastHit.body, 'echo=SUPER-SECRET-TOKEN-9f8e');
    assert.ok(lastHit.url.includes('SUPER-SECRET-TOKEN-9f8e'));

    // Mas nada do retorno ao renderer contém o segredo em claro
    const serialized = JSON.stringify(res);
    assert.ok(!serialized.includes('SUPER-SECRET-TOKEN-9f8e'), 'resposta não deve vazar o segredo');
    assert.ok(serialized.includes('••••'));
    assert.ok(res.requestSent.headers.Authorization.includes('••••'));
    assert.ok(!res.requestSent.url.includes('SUPER-SECRET-TOKEN-9f8e'));
  });

  it('returns VAULT_LOCKED and opens no connection when vault is locked', async () => {
    ctx.vault.lock();
    let hit = false;
    const spy = http.createServer((req, res) => { hit = true; res.end('{}'); });
    await new Promise((resolve) => spy.listen(0, '127.0.0.1', resolve));
    const spyUrl = `http://127.0.0.1:${spy.address().port}`;

    const res = await ctx.httpEngine.executeHttpRequest({
      method: 'GET',
      url: `${spyUrl}/x?auth={{vault.api_token}}`,
      headers: [],
      timeoutMs: 5000
    });

    assert.equal(res.ok, false);
    assert.equal(res.error.code, 'VAULT_LOCKED');
    assert.deepEqual(res.error.keys, ['api_token']);
    assert.equal(hit, false, 'nenhuma conexão deve ser aberta');
    await new Promise((resolve) => spy.close(resolve));
  });

  it('returns VAULT_KEY_NOT_FOUND for unknown keys', async () => {
    ctx.vault.unlock('master-pw');
    const res = await ctx.httpEngine.executeHttpRequest({
      method: 'GET',
      url: `${baseUrl}/{{vault.does_not_exist}}`,
      headers: [],
      timeoutMs: 5000
    });
    assert.equal(res.ok, false);
    assert.equal(res.error.code, 'VAULT_KEY_NOT_FOUND');
    assert.deepEqual(res.error.keys, ['does_not_exist']);
  });

  it('works in web-mode dispatch path (http-bridge)', async () => {
    const { dispatchWebIpc } = require('../../main/ipc/http-bridge');
    ctx.vault.setSecret('api_token', 'BRIDGE-TOKEN-1');
    const res = await dispatchWebIpc(ctx, 'pm:runtime:request', {
      method: 'GET',
      url: `${baseUrl}/bridge?auth={{vault.api_token}}`,
      headers: [],
      timeoutMs: 5000
    });
    assert.equal(res.ok, true);
    assert.ok(!JSON.stringify(res).includes('BRIDGE-TOKEN-1'));
    assert.equal(JSON.parse(res.body).url.includes('••••'), true);
    assert.ok(lastHit.url.includes('BRIDGE-TOKEN-1'));
  });
});
