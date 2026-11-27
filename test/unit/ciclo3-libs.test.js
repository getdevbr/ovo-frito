'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const pv = require('../../renderer/lib/path-vars');
const catalog = require('../../renderer/lib/http-headers-catalog');
const jsonDiff = require('../../renderer/lib/json-diff');
const ws = require('../../renderer/lib/workspace-search');

describe('path-vars (U-17)', () => {
  it('extracts :param and {param} without matching port or {{envVar}}', () => {
    const keys = pv.extractPathVarKeys('http://localhost:3000/{{prefix}}/users/:userId/orders/{orderId}?active=true');
    assert.deepEqual(keys, ['userId', 'orderId']);
  });

  it('syncs existing values and applies path variables preserving template', () => {
    const synced = pv.syncPathVars('https://api.x.com/users/:id/posts/{postId}', [{ key: 'id', value: '42', description: 'User ID' }]);
    assert.equal(synced.length, 2);
    assert.equal(synced[0].value, '42');
    assert.equal(synced[1].value, '');
    const resolved = pv.applyPathVars('https://api.x.com/users/:id/posts/{postId}?q=1', [
      { key: 'id', value: '42' },
      { key: 'postId', value: 'a b' }
    ]);
    assert.equal(resolved, 'https://api.x.com/users/42/posts/a%20b?q=1');
  });
});

describe('http-headers-catalog (U-16)', () => {
  it('suggests header keys and contextual values', () => {
    const keys = catalog.suggestKeys('cont');
    assert.ok(keys.some((h) => h.name === 'Content-Type'));
    const vals = catalog.suggestValues('Content-Type', 'json');
    assert.ok(vals.includes('application/json'));
  });
});

describe('json-diff (FUT-07)', () => {
  it('detects added, removed, changed and respects ignorePaths', () => {
    const a = { id: 1, name: 'Ana', ts: 100, old: true, items: [{ x: 1 }] };
    const b = { id: 1, name: 'Bia', ts: 200, extra: 'ok', items: [{ x: 2 }] };
    const changes = jsonDiff.diffJson(a, b, { ignorePaths: 'ts' });
    assert.equal(changes.some((c) => c.path === 'ts'), false);
    assert.ok(changes.some((c) => c.type === 'changed' && c.path === 'name'));
    assert.ok(changes.some((c) => c.type === 'removed' && c.path === 'old'));
    assert.ok(changes.some((c) => c.type === 'added' && c.path === 'extra'));
    assert.ok(changes.some((c) => c.type === 'changed' && c.path === 'items[0].x'));
  });
});

describe('workspace-search (FUT-13)', () => {
  const cols = [
    {
      id: 'c1',
      name: 'API',
      items: [
        { id: 'r1', method: 'GET', name: 'List Users', url: 'https://api.x.com/users', headers: [], body: { raw: '' }, preRequestScript: '' },
        { id: 'r2', method: 'POST', name: 'Create Order', url: 'https://api.x.com/orders', headers: [{ key: 'X-Custom', value: 'secret-tag' }], body: { raw: '{"sku":"ABC-99"}' }, preRequestScript: 'console.log("order-hook")' }
      ]
    }
  ];

  it('filters by method: and in: scopes', () => {
    assert.equal(ws.searchCollections(cols, 'method:POST').length, 1);
    assert.equal(ws.searchCollections(cols, 'in:body ABC-99').length, 1);
    assert.equal(ws.searchCollections(cols, 'in:url ABC-99').length, 0);
    assert.equal(ws.searchCollections(cols, 'in:headers secret-tag').length, 1);
    assert.equal(ws.searchCollections(cols, 'in:scripts order-hook').length, 1);
  });
});
