'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { interpolateString, getByPath } = require('../../renderer/lib/interpolate');

describe('interpolate', () => {
  it('replaces variables, $timestamp, $isoDate, and @chain refs', () => {
    const result = interpolateString('{{base_url}}/users/{{@Login.json.id}}?t={{$timestamp}}', {
      variables: { base_url: 'http://127.0.0.1:3000' },
      resolveChainRef: (key) => (key === '@Login.json.id' ? 42 : undefined),
      now: () => 1700000000000
    });
    assert.equal(result, 'http://127.0.0.1:3000/users/42?t=1700000000');
  });

  it('preserves unknown placeholders', () => {
    assert.equal(interpolateString('{{missing}}', { variables: {} }), '{{missing}}');
  });

  it('resolves nested paths with array indices', () => {
    assert.equal(getByPath({ items: [{ name: 'ok' }] }, 'items[0].name'), 'ok');
  });
});
