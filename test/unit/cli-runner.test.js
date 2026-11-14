'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadRequests, toJUnit } = require('../../main/cli-runner');

describe('cli-runner', () => {
  it('loads envelope .ovo request exported by the app', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdo-cli-'));
    const file = path.join(dir, 'login.ovo');
    fs.writeFileSync(file, JSON.stringify({
      format: 'ovo-frito/v1',
      type: 'request',
      request: {
        name: 'Login',
        method: 'POST',
        url: '{{base_url}}/login',
        headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
        auth: { type: 'none' },
        body: { mode: 'json', raw: '{"user":"a"}' },
        assertions: [{ source: 'status', operator: '==', target: '200', enabled: true }]
      }
    }));
    const { requests } = loadRequests(file);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].name, 'Login');
    assert.equal(requests[0].method, 'POST');
    assert.equal(requests[0].headers[0].key, 'Content-Type');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('emits junit xml with failures', () => {
    const xml = toJUnit([
      { method: 'GET', name: 'ok', ok: true, timeMs: 12 },
      { method: 'POST', name: 'bad <req>', ok: false, timeMs: 5, error: 'boom' }
    ], 'suite');
    assert.match(xml, /<testsuite name="suite" tests="2" failures="1">/);
    assert.match(xml, /<testcase classname="suite" name="GET ok"/);
    assert.match(xml, /bad &lt;req&gt;/);
    assert.match(xml, /<failure message="boom">boom<\/failure>/);
  });
});
