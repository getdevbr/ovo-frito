(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.poller = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  class Poller {
    constructor({
      intervalMs = 2000,
      maxAttempts = 30,
      timeoutMs = 120000,
      maxConsecutiveNetworkErrors = 3,
      send,
      evaluate,
      sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
      now = Date.now
    }) {
      this.intervalMs = Math.max(500, Number(intervalMs) || 2000);
      this.maxAttempts = Math.max(1, Number(maxAttempts) || 30);
      this.timeoutMs = Math.max(1000, Number(timeoutMs) || 120000);
      this.maxConsecutiveNetworkErrors = maxConsecutiveNetworkErrors;
      this.send = send;
      this.evaluate = evaluate;
      this.sleep = sleep;
      this.now = now;
      this.state = 'idle';
      this.attempts = 0;
      this.lastResponse = null;
      this.listeners = new Map();
    }

    on(event, fn) {
      if (!this.listeners.has(event)) this.listeners.set(event, new Set());
      this.listeners.get(event).add(fn);
      return () => this.listeners.get(event)?.delete(fn);
    }

    emit(event, payload) {
      const set = this.listeners.get(event);
      if (!set) return;
      for (const fn of set) fn(payload);
    }

    stop() {
      if (this.state === 'running') {
        this.state = 'stopped';
      }
    }

    async start() {
      if (this.state === 'running') return;
      this.state = 'running';
      this.attempts = 0;
      this.lastResponse = null;
      const startedAt = this.now();
      let consecutiveNetErrors = 0;

      while (this.state === 'running') {
        if (this.now() - startedAt >= this.timeoutMs) {
          this.state = 'timeout';
          break;
        }
        if (this.attempts >= this.maxAttempts) {
          this.state = 'failed';
          break;
        }

        this.attempts += 1;
        let response;
        try {
          response = await this.send();
        } catch (err) {
          response = { ok: false, status: 0, error: err.message };
        }
        this.lastResponse = response;

        if (this.state !== 'running') break;

        if (!response || response.ok === false) {
          consecutiveNetErrors += 1;
          if (consecutiveNetErrors >= this.maxConsecutiveNetworkErrors) {
            this.emit('attempt', { attempt: this.attempts, response, passed: false });
            this.state = 'failed';
            break;
          }
        } else {
          consecutiveNetErrors = 0;
        }

        const passed = Boolean(this.evaluate ? this.evaluate(response) : response?.ok);
        this.emit('attempt', { attempt: this.attempts, response, passed });

        if (passed) {
          this.state = 'succeeded';
          break;
        }

        if (this.attempts >= this.maxAttempts) {
          this.state = 'failed';
          break;
        }

        await this.sleep(this.intervalMs);
      }

      const summary = {
        state: this.state,
        attempts: this.attempts,
        lastResponse: this.lastResponse
      };
      this.emit('done', summary);
      return summary;
    }
  }

  return {
    Poller
  };
});
