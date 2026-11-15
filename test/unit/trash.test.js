'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const tl = require('../../renderer/lib/trash');
const { createUndoStack } = require('../../renderer/lib/undo-stack');

describe('trash lib', () => {
  it('createEntry snapshots item and sanitizes disk copy', () => {
    const item = {
      id: 'c1', name: 'API',
      variables: [{ key: 'tok', value: 's3cret', secret: true, enabled: true }],
      auth: { type: 'bearer', token: 'abc123' },
      headers: [{ key: 'Authorization', value: 'Bearer x' }]
    };
    const e = tl.createEntry({ type: 'collection', item, origin: { index: 0 }, now: 1700000000000 });
    assert.equal(e.name, 'API');
    assert.equal(e.item.variables[0].value, 's3cret'); // memória mantém completo
    assert.equal(e.disk.variables[0].value, ''); // disco sanitizado
    assert.equal(e.disk.auth.token, '');
    assert.equal(e.disk.headers[0].value, '');
    assert.ok(!('item' in JSON.parse(JSON.stringify({ ...e, item: undefined }))));
  });

  it('restore reinserts at original index', () => {
    const state = { collections: [{ id: 'a' }, { id: 'c' }] };
    const entry = tl.createEntry({ type: 'collection', item: { id: 'b', name: 'B' }, origin: { index: 1 } });
    const res = tl.restore(state, entry);
    assert.equal(res.ok, true);
    assert.deepEqual(state.collections.map((c) => c.id), ['a', 'b', 'c']);
  });

  it('restore request into collection; fails when origin missing', () => {
    const state = { collections: [{ id: 'col', items: [{ id: 'x' }] }] };
    const ok = tl.restore(state, tl.createEntry({ type: 'request', item: { id: 'r' }, origin: { collectionId: 'col', index: 0 } }));
    assert.equal(ok.ok, true);
    assert.equal(state.collections[0].items[0].id, 'r');
    const bad = tl.restore(state, tl.createEntry({ type: 'request', item: { id: 'r2' }, origin: { collectionId: 'gone', index: 0 } }));
    assert.equal(bad.ok, false);
  });

  it('restore environment and profile', () => {
    const state = { environments: [{ id: 'e1', customProfiles: [] }] };
    assert.equal(tl.restore(state, tl.createEntry({ type: 'environment', item: { id: 'e2' }, origin: { index: 0 } })).ok, true);
    const prof = tl.createEntry({ type: 'profile', item: { id: 'p1', name: 'P' }, origin: { environmentId: 'e1', index: 0 } });
    assert.equal(tl.restore(state, prof).ok, true);
    const e1 = state.environments.find((e) => e.id === 'e1');
    assert.equal(e1.customProfiles[0].id, 'p1');
  });

  it('purgeExpired removes entries older than 30 days', () => {
    const now = Date.now();
    const entries = [
      { id: 'old', deletedAt: new Date(now - 31 * 86400000).toISOString() },
      { id: 'new', deletedAt: new Date(now - 86400000).toISOString() }
    ];
    const kept = tl.purgeExpired(entries, now, 30);
    assert.deepEqual(kept.map((e) => e.id), ['new']);
  });

  it('removeFromState removes by type', () => {
    const state = {
      collections: [{ id: 'c1', items: [{ id: 'r1' }, { id: 'r2' }] }],
      environments: [{ id: 'e1' }]
    };
    assert.equal(tl.removeFromState(state, tl.createEntry({ type: 'request', item: { id: 'r1' }, origin: { collectionId: 'c1' } })), true);
    assert.deepEqual(state.collections[0].items.map((i) => i.id), ['r2']);
    assert.equal(tl.removeFromState(state, tl.createEntry({ type: 'collection', item: { id: 'c1' } })), true);
    assert.equal(state.collections.length, 0);
  });
});

describe('undo-stack', () => {
  it('push/undo/redo with limit and redo discard', () => {
    const s = createUndoStack({ limit: 3 });
    s.push('a'); s.push('b'); s.push('c'); s.push('d');
    assert.equal(s.size().undo, 3);
    assert.equal(s.undo(), 'd');
    assert.equal(s.undo(), 'c');
    assert.equal(s.redo(), 'c');
    s.push('e');
    assert.equal(s.canRedo(), false);
    assert.equal(s.redo(), undefined);
    assert.equal(s.undo(), 'e');
  });
});
