'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const rc = require('../../renderer/lib/recents');

describe('recents lib', () => {
  it('touch moves to front without duplicates and respects max', () => {
    let l = rc.touch([], 'a', 3);
    l = rc.touch(l, 'b', 3);
    l = rc.touch(l, 'a', 3);
    assert.deepEqual(l, ['a', 'b']);
    l = rc.touch(l, 'c', 3);
    l = rc.touch(l, 'd', 3);
    assert.deepEqual(l, ['d', 'c', 'a']);
    assert.equal(rc.touch(l, null, 3).length, 3);
  });

  it('toggle adds/removes', () => {
    let l = rc.toggle([], 'x');
    assert.deepEqual(l, ['x']);
    l = rc.toggle(l, 'y');
    l = rc.toggle(l, 'x');
    assert.deepEqual(l, ['y']);
  });

  it('prune removes orphan ids', () => {
    assert.deepEqual(rc.prune(['a', 'b', 'c'], ['a', 'c']), ['a', 'c']);
    assert.deepEqual(rc.prune(['a'], new Set(['a'])), ['a']);
    assert.deepEqual(rc.prune(null, []), []);
  });

  it('reorder moves item', () => {
    assert.deepEqual(rc.reorder(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a']);
    assert.deepEqual(rc.reorder(['a'], 5, 0), ['a']);
  });
});
