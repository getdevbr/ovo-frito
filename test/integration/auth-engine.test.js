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

describe('auth-engine integration', () => {
  let tmpDir;
  let engine;
  let server;
  let baseUrl;

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdo-auth-'));
    const storage = createStorage({ dataDir: tmpDir });
    storage.ensurePortableDataDir();
    engine = createHttpEngine({ storage, cookieJar: createCookieJar(storage) });

    server = http.createServer((req, res) => {
      if (req.url === '/digest') {
        if (!req.headers.authorization) {
          res.writeHead(401, {
            'WWW-Authenticate': 'Digest realm="testrealm@host.com", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", qop="auth"'
          });
          res.end('auth required');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ authorization: req.headers.authorization }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ headers: req.headers }));
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('retries Digest auth after 401 challenge', async () => {
    const res = await engine.executeHttpRequest({
      method: 'GET',
      url: `${baseUrl}/digest`,
      auth: { type: 'digest', username: 'Mufasa', password: 'Circle Of Life' }
    });
    assert.equal(res.status, 200);
    const data = JSON.parse(res.body);
    assert.match(data.authorization, /^Digest /);
    assert.match(data.authorization, /response="[0-9a-f]{32}"/);
  });

  it('signs AWS SigV4 request', async () => {
    const res = await engine.executeHttpRequest({
      method: 'GET',
      url: `${baseUrl}/aws`,
      auth: {
        type: 'aws_sigv4',
        accessKey: 'AKIDEXAMPLE',
        secretKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
        region: 'us-east-1',
        service: 'execute-api'
      }
    });
    assert.equal(res.status, 200);
    const headers = JSON.parse(res.body).headers;
    assert.match(headers.authorization, /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\//);
    assert.ok(headers['x-amz-date']);
    assert.ok(headers['x-amz-content-sha256']);
  });
});
