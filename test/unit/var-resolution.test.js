'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const vr = require('../../renderer/lib/var-resolution');

describe('var-resolution', () => {
  it('findRefs returns keys with positions and kinds', () => {
    const refs = vr.findRefs('http://x/{{host}}/p/{{ $token }}/{{@prev.id}}/{{vault.key}}');
    assert.equal(refs.length, 4);
    assert.deepEqual(refs.map((r) => r.kind), ['var', 'dynamic', 'chain', 'vault']);
    assert.equal(refs[0].key, 'host');
    assert.equal(refs[2].key, '@prev.id');
    assert.ok(refs[0].start >= 0 && refs[0].end > refs[0].start);
    assert.deepEqual(vr.findRefs('no vars'), []);
    assert.deepEqual(vr.findRefs(null), []);
  });

  it('resolveChain applies last-scope-wins precedence', () => {
    const scopes = [
      { name: 'Collection', vars: [{ key: 'a', value: 'col' }] },
      { name: 'Environment', vars: [{ key: 'a', value: 'env', secret: true }] },
      { name: 'Runner', vars: [] }
    ];
    const res = vr.resolveChain('a', scopes);
    assert.equal(res.value, 'env');
    assert.equal(res.source, 'Environment');
    assert.equal(res.secret, true);
    assert.equal(res.chain.length, 3);
    assert.equal(res.chain[0].defined, true);
    assert.equal(res.chain[2].defined, false);
  });

  it('resolveChain reports undefined', () => {
    const res = vr.resolveChain('nope', [{ name: 'E', vars: [] }]);
    assert.equal(res.defined, false);
    assert.equal(res.value, undefined);
  });

  it('findUnresolved scans url, headers, params and body', () => {
    const req = {
      url: 'http://{{host}}/x',
      params: [{ key: 'q', value: '{{known}}' }],
      headers: [{ key: 'Authorization', value: 'Bearer {{token}}' }],
      body: { mode: 'json', raw: '{"a":"{{missing}}"}' }
    };
    const defined = new Set(['host', 'known']);
    const missing = vr.findUnresolved(req, (k) => defined.has(k));
    const keys = missing.map((m) => m.key).sort();
    assert.deepEqual(keys, ['missing', 'token']);
  });

  it('findUnresolved ignores vault.* (resolved in main)', () => {
    const missing = vr.findUnresolved({ url: '{{vault.api_key}}' }, () => false);
    assert.equal(missing.length, 0);
  });
});
