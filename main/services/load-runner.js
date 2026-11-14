'use strict';

const { LoadStats } = require('../../renderer/lib/stats');
const { interpolateString } = require('../../renderer/lib/interpolate');
const { GENERATOR_MAP } = require('../../renderer/lib/generators-br');
const { evaluateAssertions } = require('../../renderer/lib/assertions');

function createLoadRunner({ httpEngine }) {
  const activeRuns = new Map();

  async function start({ runId = `run_${Date.now()}`, spec, variables = {}, concurrency = 5, iterations = 10, durationMs = 0, assertions = [], onProgress } = {}) {
    const workers = Math.max(1, Math.min(200, Number(concurrency) || 1));
    const maxDurationMs = Math.min(300000, Number(durationMs) || 0);
    const totalIterations = maxDurationMs > 0 ? Infinity : Math.max(1, Number(iterations) || 1);

    const stats = new LoadStats();
    let aborted = false;
    let issued = 0;
    const endAt = maxDurationMs > 0 ? Date.now() + maxDurationMs : Infinity;

    const control = {
      stop: () => {
        aborted = true;
      }
    };
    activeRuns.set(runId, control);

    const progressTimer = setInterval(() => {
      if (typeof onProgress === 'function') {
        onProgress({ runId, ...stats.snapshot() });
      }
    }, 250);
    progressTimer.unref?.();

    async function worker() {
      while (!aborted) {
        if (Date.now() >= endAt) break;
        if (issued >= totalIterations) break;
        issued += 1;

        const interpolatedSpec = {
          ...spec,
          url: interpolateString(spec.url, { variables, generators: GENERATOR_MAP })
        };
        const res = await httpEngine.executeHttpRequest(interpolatedSpec);
        let ok = Boolean(res.ok && res.status >= 200 && res.status < 400);
        if (ok && assertions.length > 0) {
          let parsed = null;
          try {
            parsed = JSON.parse(res.body);
          } catch {}
          const aRes = evaluateAssertions(assertions, res, parsed);
          ok = aRes.every((r) => r.passed);
        }
        stats.record({ ok, status: res.status, timeMs: res.timeMs });
      }
    }

    try {
      await Promise.all(Array.from({ length: workers }, () => worker()));
    } finally {
      clearInterval(progressTimer);
      activeRuns.delete(runId);
    }

    return { runId, aborted, ...stats.snapshot() };
  }

  function stop(runId) {
    const c = activeRuns.get(runId);
    if (c) {
      c.stop();
      return true;
    }
    return false;
  }

  async function stopAll() {
    for (const c of activeRuns.values()) c.stop();
  }

  function status() {
    return { activeRuns: activeRuns.size };
  }

  return {
    start,
    stop,
    stopAll,
    status
  };
}

module.exports = {
  createLoadRunner
};
