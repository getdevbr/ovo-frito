'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { ServiceManager } = require('../../main/services/ServiceManager');

describe('ServiceManager', () => {
  it('registers services, reports statusAll, and stops all on stopAll', async () => {
    const sm = new ServiceManager();
    let stopped = false;

    sm.register('mock', {
      status: () => ({ running: !stopped, port: 4000 }),
      stop: async () => {
        stopped = true;
      }
    });

    assert.deepEqual(sm.statusAll(), { mock: { running: true, port: 4000 } });
    await sm.stopAll(500);
    assert.equal(stopped, true);
    assert.deepEqual(sm.statusAll(), { mock: { running: false, port: 4000 } });
  });

  it('rejects invalid service without stop()', () => {
    const sm = new ServiceManager();
    assert.throws(() => sm.register('bad', {}), /Serviço inválido/);
  });
});
