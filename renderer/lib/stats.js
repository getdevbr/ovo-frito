(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.stats = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function percentile(sortedArr, p) {
    if (!sortedArr.length) return 0;
    const idx = Math.ceil((p / 100) * sortedArr.length) - 1;
    return sortedArr[Math.max(0, Math.min(sortedArr.length - 1, idx))];
  }

  class LoadStats {
    constructor({ maxSamples = 100000 } = {}) {
      this.maxSamples = maxSamples;
      this.total = 0;
      this.succeeded = 0;
      this.failed = 0;
      this.minMs = Infinity;
      this.maxMs = 0;
      this.sumMs = 0;
      this.samples = [];
      this.statusCounts = {};
      this.startedAt = Date.now();
    }

    record({ ok, status, timeMs }) {
      this.total += 1;
      if (ok) this.succeeded += 1;
      else this.failed += 1;

      const ms = Number(timeMs) || 0;
      if (ms < this.minMs) this.minMs = ms;
      if (ms > this.maxMs) this.maxMs = ms;
      this.sumMs += ms;

      const sKey = String(status || 0);
      this.statusCounts[sKey] = (this.statusCounts[sKey] || 0) + 1;

      if (this.samples.length < this.maxSamples) {
        this.samples.push(ms);
      } else {
        const idx = Math.floor(Math.random() * this.total);
        if (idx < this.maxSamples) this.samples[idx] = ms;
      }
    }

    snapshot() {
      const elapsedSec = Math.max(0.001, (Date.now() - this.startedAt) / 1000);
      const sorted = this.samples.slice().sort((a, b) => a - b);
      return {
        total: this.total,
        succeeded: this.succeeded,
        failed: this.failed,
        errorRate: this.total ? Number(((this.failed / this.total) * 100).toFixed(2)) : 0,
        rps: Number((this.total / elapsedSec).toFixed(2)),
        minMs: this.total ? this.minMs : 0,
        avgMs: this.total ? Math.round(this.sumMs / this.total) : 0,
        maxMs: this.maxMs,
        p50: percentile(sorted, 50),
        p90: percentile(sorted, 90),
        p95: percentile(sorted, 95),
        p99: percentile(sorted, 99),
        statusCounts: { ...this.statusCounts }
      };
    }
  }

  return {
    percentile,
    LoadStats
  };
});
