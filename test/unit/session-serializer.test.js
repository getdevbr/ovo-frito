'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { serializeSession, scrubAuth, scrubHeaders } = require('../../renderer/lib/session-serializer');

function makeTab(overrides = {}) {
  return {
    id: 't1', name: 'Req', method: 'GET', url: 'http://x',
    headers: [{ key: 'Authorization', value: 'Bearer tok' }, { key: 'X-Ok', value: 'v' }],
    auth: { type: 'bearer', token: 'secret-token' },
    body: { mode: 'raw', raw: '{"a":1}' },
    response: { ok: true, status: 200, body: 'small', requestSent: { resolvedAuth: { token: 'rt' } } },
    history: [{ response: { body: 'h' } }],
    ...overrides
  };
}

describe('session-serializer', () => {
  it('removes tokens/passwords/secrets from disk copy', () => {
    const { data } = serializeSession({ tabs: [makeTab()], activeTabId: 't1' });
    const t = data.tabs[0];
    assert.equal(t.auth.token, '');
    assert.equal(t.headers[0].value, '');
    assert.equal(t.headers[1].value, 'v');
    assert.equal(t.response.requestSent.resolvedAuth.token, '');
    // in-memory source untouched
  });

  it('keeps {{var}} references intact', () => {
    const tab = makeTab({ url: 'http://{{base}}/x', headers: [{ key: 'X', value: '{{token}}' }] });
    const { data } = serializeSession({ tabs: [tab] });
    assert.equal(data.tabs[0].url, 'http://{{base}}/x');
    assert.equal(data.tabs[0].headers[0].value, '{{token}}');
  });

  it('truncates bodies above maxBodyBytes keeping metadata', () => {
    const big = 'x'.repeat(2 * 1024 * 1024);
    const tab = makeTab({ response: { ok: true, status: 200, body: big, timeMs: 5, contentType: 'text/plain' } });
    const { data, droppedBodies } = serializeSession({ tabs: [tab] }, { maxBodyBytes: 1024 });
    assert.equal(data.tabs[0].response.body, '');
    assert.equal(data.tabs[0].response.bodyTruncated, true);
    assert.equal(data.tabs[0].response.bodyMeta.sizeBytes, big.length);
    assert.equal(droppedBodies, 1);
  });

  it('never persists responseCache and marks cleanShutdown', () => {
    const { data } = serializeSession({ tabs: [], activeTabId: null, responseCache: { a: {} }, cleanShutdown: false });
    assert.deepEqual(data.responseCache, {});
    assert.equal(data.cleanShutdown, false);
  });

  it('scrubAuth clears all secret fields', () => {
    const out = scrubAuth({ type: 'oauth2', token: 't', password: 'p', clientSecret: 'cs', username: 'u' });
    assert.equal(out.token, '');
    assert.equal(out.password, '');
    assert.equal(out.clientSecret, '');
    assert.equal(out.username, 'u');
  });

  it('scrubHeaders only clears sensitive names', () => {
    const out = scrubHeaders([{ key: 'Cookie', value: 'a=b' }, { key: 'Accept', value: 'json' }]);
    assert.equal(out[0].value, '');
    assert.equal(out[1].value, 'json');
  });
});
