'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { looksLikeCurl, normalizeWindowsCurl } = require('../../renderer/lib/curl-detect');

// stubs para as dependências globais do importer no contexto Node
global.createBlankTab = (o = {}) => ({ id: 't', params: [], headers: [], auth: { type: 'none' }, body: { mode: 'none' }, ...o });
global.syncParamsFromUrl = () => {};
const { parseCurlCommand } = require('../../renderer/core/importer');

describe('curl-detect', () => {
  it('detects curl commands', () => {
    assert.equal(looksLikeCurl('curl https://api.x.com'), true);
    assert.equal(looksLikeCurl('  CURL.EXE -X POST http://a'), true);
    assert.equal(looksLikeCurl('curl'), true);
    assert.equal(looksLikeCurl('https://api.x.com'), false);
    assert.equal(looksLikeCurl(''), false);
    assert.equal(looksLikeCurl(null), false);
  });

  it('normalizeWindowsCurl joins ^ continuations', () => {
    const cmd = 'curl -X POST http://a ^\r\n  -H "A: b" ^\r\n  -d "x=1"';
    const out = normalizeWindowsCurl(cmd);
    assert.ok(!out.includes('^'));
    assert.match(out, /-H "A: b"/);
  });

  it('parses bash curl with headers and json body', () => {
    const t = parseCurlCommand(`curl -X POST 'https://api.example.com/users' \\
      -H 'Content-Type: application/json' \\
      -H 'Authorization: Bearer tok123' \\
      -d '{"name":"Ana"}'`);
    assert.equal(t.method, 'POST');
    assert.equal(t.url, 'https://api.example.com/users');
    assert.equal(t.auth.type, 'bearer');
    assert.equal(t.auth.token, 'tok123');
    assert.equal(t.body.mode, 'json');
    assert.ok(t.headers.some((h) => h.key === 'Content-Type'));
  });

  it('parses windows cmd curl', () => {
    const t = parseCurlCommand(normalizeWindowsCurl('curl -X GET http://a.io ^\r\n-H "X-Test: 1"'));
    assert.equal(t.method, 'GET');
    assert.equal(t.url, 'http://a.io');
    assert.ok(t.headers.some((h) => h.key === 'X-Test' && h.value === '1'));
  });

  it('parses basic auth -u', () => {
    const t = parseCurlCommand('curl -u user:pass https://a.io');
    assert.equal(t.auth.type, 'basic');
    assert.equal(t.auth.username, 'user');
    assert.equal(t.auth.password, 'pass');
  });
});
