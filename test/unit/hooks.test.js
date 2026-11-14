'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createHookBus } = require('../../renderer/lib/hooks');

describe('hooks', () => {
  it('emits events to registered listeners and supports unsubscribe', () => {
    const bus = createHookBus();
    const received = [];
    const off = bus.on('app:ready', (payload) => received.push(payload));

    bus.emit('app:ready', { step: 1 });
    off();
    bus.emit('app:ready', { step: 2 });

    assert.deepEqual(received, [{ step: 1 }]);
  });

  it('supports emitAsync sequentially', async () => {
    const bus = createHookBus();
    const order = [];
    bus.on('before', async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push(1);
    });
    bus.on('before', async () => {
      order.push(2);
    });

    await bus.emitAsync('before', {});
    assert.deepEqual(order, [1, 2]);
  });
});
