'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('../../renderer/lib/text-search');

describe('text-search lib (U-12)', () => {
  it('countMatches case-insensitive, non-overlapping', () => {
    assert.equal(ts.countMatches('Foo foo FOO', 'foo'), 3);
    assert.equal(ts.countMatches('aaaa', 'aa'), 2);
    assert.equal(ts.countMatches('abc', ''), 0);
    assert.equal(ts.countMatches(null, 'x'), 0);
  });

  it('highlight escapes html and wraps matches', () => {
    const r = ts.highlight('<b>foo</b> bar FOO', 'foo');
    assert.equal(r.count, 2);
    assert.ok(r.html.includes('&lt;b&gt;'));
    assert.ok(r.html.includes('<mark class="res-search-hit">foo</mark>'));
    assert.ok(r.html.includes('<mark class="res-search-hit">FOO</mark>'));
  });

  it('empty query returns escaped text, count 0', () => {
    const r = ts.highlight('a<b', '');
    assert.equal(r.count, 0);
    assert.equal(r.html, 'a&lt;b');
  });

  it('matchIndices returns positions with cap', () => {
    assert.deepEqual(ts.matchIndices('ab ab ab', 'ab'), [0, 3, 6]);
    assert.deepEqual(ts.matchIndices('x', 'ab', 5), []);
    assert.equal(ts.matchIndices('aaaa', 'aa', 1).length, 1);
  });
});
