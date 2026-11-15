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

  it('keeps {{vault.*}} references literal in serialized output', () => {
    const req = {
      id: 'r2',
      name: 'VaultReq',
      method: 'GET',
      url: 'https://api.example.com/{{vault.api_token}}',
      headers: [{ key: 'Authorization', value: 'Bearer {{vault.api_token}}', enabled: true }],
      body: { mode: 'raw', raw: '{"k":"{{vault.deep.key-1}}"}' }
    };
    const out = ovo.serializeRequest(req);
    assert.ok(out.includes('{{vault.api_token}}'));
    assert.ok(out.includes('{{vault.deep.key-1}}'));
    const parsed = ovo.parseRequest(out);
    assert.equal(parsed.url, 'https://api.example.com/{{vault.api_token}}');
    assert.equal(parsed.headers[0].value, 'Bearer {{vault.api_token}}');
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
