'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const hs = require('../../renderer/lib/history-search');

describe('history-search lib (U-07)', () => {
  const entries = [
    { method: 'GET', url: 'https://api.a/users', status: 200, timestamp: '2024-01-02T10:00:00Z' },
    { method: 'POST', url: 'https://api.b/orders', status: 500, timestamp: '2024-01-03T10:00:00Z' },
    { method: 'GET', url: 'https://api.a/users/42', status: 404, timestamp: '2024-01-01T10:00:00Z' }
  ];

  it('empty term matches all', () => {
    assert.equal(hs.filter(entries.map((e) => ({ entry: e })), '').length, 3);
    assert.equal(hs.matches(entries[0], ''), true);
  });

  it('matches method, url, status, timestamp', () => {
    assert.equal(hs.filter(entries.map((e) => ({ entry: e })), 'post').length, 1);
    assert.equal(hs.filter(entries.map((e) => ({ entry: e })), 'users').length, 2);
    assert.equal(hs.filter(entries.map((e) => ({ entry: e })), '404').length, 1);
    assert.equal(hs.filter(entries.map((e) => ({ entry: e })), '2024-01-03').length, 1);
  });

  it('newestFirst sorts desc', () => {
    const out = hs.filter(entries.map((e) => ({ entry: e })), '', { newestFirst: true });
    assert.equal(out[0].entry.timestamp, '2024-01-03T10:00:00Z');
  });

  it('perf: 5000 entries filter < 100ms', () => {
    const big = Array.from({ length: 5000 }, (_, i) => ({
      entry: { method: 'GET', url: `https://api.example.com/r${i}`, status: 200, timestamp: `2024-01-${String(i % 28 + 1).padStart(2, '0')}T00:00:00Z` }
    }));
    const t0 = Date.now();
    const out = hs.filter(big, 'example.com/r4999');
    assert.ok(Date.now() - t0 < 100);
    assert.equal(out.length, 1);
  });
});
