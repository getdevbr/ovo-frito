'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ovo = require('../../renderer/lib/serializers/ovo');

describe('serializer-ovo', () => {
  it('serializes deterministically and roundtrips request', () => {
    const req = { id: 'r1', name: 'Login', method: 'POST', url: 'http://localhost/login', history: [{ status: 200 }] };
    const s1 = ovo.serializeRequest(req);
    const s2 = ovo.serializeRequest({ ...req, url: req.url });
    assert.equal(s1, s2);
    assert.equal(s1.includes('"history"'), false);
    const parsed = ovo.parseRequest(s1);
    assert.equal(parsed.id, 'r1');
    assert.equal(parsed.method, 'POST');
  });

  it('strips secret variable values in collection meta', () => {
    const out = ovo.serializeCollectionMeta({
      id: 'c1',
      name: 'Col',
      variables: [{ key: 'API_KEY', value: 'super-secret', secret: true }]
    });
    assert.equal(out.includes('super-secret'), false);
  });
});
