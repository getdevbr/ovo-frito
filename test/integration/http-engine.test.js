'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createStorage } = require('../../main/storage');
const { createCookieJar } = require('../../main/cookie-jar');
const { createHttpEngine } = require('../../main/http-engine');

describe('http-engine integration', () => {
  let tmpDir;
  let storage;
  let cookieJar;
  let engine;
  let server;
  let baseUrl;

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdo-int-'));
    storage = createStorage({ dataDir: tmpDir });
    storage.ensurePortableDataDir();
    cookieJar = createCookieJar(storage);
    engine = createHttpEngine({ storage, cookieJar });

    server = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (req.url === '/slow') {
          setTimeout(() => {
            if (!res.writableEnded) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ slow: true }));
            }
          }, 300);
          return;
        }
        if (req.url === '/set-cookie') {
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Set-Cookie': 'sid=abc123; Path=/; HttpOnly'
          });
          res.end(JSON.stringify({ ok: true }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            method: req.method,
            url: req.url,
            headers: req.headers,
            body
          })
        );
      });
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('executes GET request', async () => {
    const res = await engine.executeHttpRequest({ method: 'GET', url: `${baseUrl}/hello?a=1` });
    assert.equal(res.ok, true);
    assert.equal(res.status, 200);
    const data = JSON.parse(res.body);
    assert.equal(data.method, 'GET');
    assert.equal(data.url, '/hello?a=1');
  });

  it('executes POST JSON request with default Content-Type', async () => {
    const res = await engine.executeHttpRequest({
      method: 'POST',
      url: `${baseUrl}/items`,
      body: { mode: 'json', raw: '{"x":1}' }
    });
    assert.equal(res.ok, true);
    const data = JSON.parse(res.body);
    assert.equal(data.headers['content-type'], 'application/json');
    assert.equal(data.body, '{"x":1}');
  });

  it('applies bearer, basic, and apikey auth', async () => {
    const r1 = await engine.executeHttpRequest({
      method: 'GET',
      url: `${baseUrl}/auth`,
      auth: { type: 'bearer', token: 'tok123' }
    });
    assert.equal(JSON.parse(r1.body).headers.authorization, 'Bearer tok123');

    const r2 = await engine.executeHttpRequest({
      method: 'GET',
      url: `${baseUrl}/auth`,
      auth: { type: 'basic', username: 'u', password: 'p' }
    });
    assert.equal(JSON.parse(r2.body).headers.authorization, `Basic ${Buffer.from('u:p').toString('base64')}`);

    const r3 = await engine.executeHttpRequest({
      method: 'GET',
      url: `${baseUrl}/auth`,
      auth: { type: 'apikey', keyName: 'k', keyValue: 'v', addTo: 'query' }
    });
    assert.equal(JSON.parse(r3.body).url, '/auth?k=v');
  });

  it('persists and resends cookies via cookie jar', async () => {
    const r1 = await engine.executeHttpRequest({ method: 'GET', url: `${baseUrl}/set-cookie` });
    assert.equal(r1.cookies.length, 1);
    assert.equal(r1.cookies[0].name, 'sid');

    const r2 = await engine.executeHttpRequest({ method: 'GET', url: `${baseUrl}/echo` });
    assert.match(JSON.parse(r2.body).headers.cookie, /sid=abc123/);
  });

  it('handles timeout gracefully', async () => {
    const res = await engine.executeHttpRequest({
      method: 'GET',
      url: `${baseUrl}/slow`,
      timeoutMs: 50
    });
    assert.equal(res.ok, false);
    assert.equal(res.status, 0);
  });

  it('returns error for invalid URL', async () => {
    const res = await engine.executeHttpRequest({ method: 'GET', url: 'http://[::1' });
    assert.equal(res.ok, false);
    assert.equal(res.statusText, 'Invalid URL');
  });
});
