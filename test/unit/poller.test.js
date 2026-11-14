'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { Poller } = require('../../renderer/lib/poller');

describe('Poller', () => {
  it('succeeds on 3rd attempt', async () => {
    let calls = 0;
    const poller = new Poller({
      intervalMs: 500,
      maxAttempts: 10,
      sleep: async () => {},
      send: async () => {
        calls += 1;
        return { ok: true, status: 200, body: calls === 3 ? 'COMPLETED' : 'PROCESSING' };
      },
      evaluate: (res) => res.body === 'COMPLETED'
    });

    const summary = await poller.start();
    assert.equal(summary.state, 'succeeded');
    assert.equal(summary.attempts, 3);
  });

  it('stops on maxAttempts', async () => {
    const poller = new Poller({
      intervalMs: 500,
      maxAttempts: 2,
      sleep: async () => {},
      send: async () => ({ ok: true, status: 200 }),
      evaluate: () => false
    });
    const summary = await poller.start();
    assert.equal(summary.state, 'failed');
    assert.equal(summary.attempts, 2);
  });

  it('stops on consecutive network errors', async () => {
    const poller = new Poller({
      intervalMs: 500,
      maxAttempts: 10,
      sleep: async () => {},
      send: async () => ({ ok: false, status: 0, error: 'ECONNREFUSED' }),
      evaluate: () => false
    });
    const summary = await poller.start();
    assert.equal(summary.state, 'failed');
    assert.equal(summary.attempts, 3);
  });

  it('supports manual stop()', async () => {
    let poller;
    poller = new Poller({
      intervalMs: 500,
      maxAttempts: 10,
      sleep: async () => {
        poller.stop();
      },
      send: async () => ({ ok: true, status: 200 }),
      evaluate: () => false
    });
    const summary = await poller.start();
    assert.equal(summary.state, 'stopped');
    assert.equal(summary.attempts, 1);
  });
});
