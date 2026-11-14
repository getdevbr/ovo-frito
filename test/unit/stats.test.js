'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { LoadStats, percentile } = require('../../renderer/lib/stats');

describe('stats', () => {
  it('computes percentiles and summary', () => {
    assert.equal(percentile([10, 20, 30, 40, 50], 95), 50);
    const st = new LoadStats();
    for (let i = 1; i <= 100; i++) {
      st.record({ ok: i <= 95, status: i <= 95 ? 200 : 500, timeMs: i });
    }
    const snap = st.snapshot();
    assert.equal(snap.total, 100);
    assert.equal(snap.succeeded, 95);
    assert.equal(snap.failed, 5);
    assert.equal(snap.p50, 50);
    assert.equal(snap.p95, 95);
    assert.equal(snap.p99, 99);
  });
});
