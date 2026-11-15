'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const envApi = require('../../renderer/core/env');

describe('U-09 prod guard flag', () => {
  it('detects env-level production', () => {
    assert.equal(envApi.isActiveProfileProduction({ name: 'prod', isProduction: true }), true);
    assert.equal(envApi.isActiveProfileProduction({ name: 'dev' }), false);
    assert.equal(envApi.isActiveProfileProduction(null), false);
  });

  it('detects profile-level production only on active profile', () => {
    const env = {
      name: 'api',
      profile: 'p2',
      isProduction: false,
      customProfiles: [
        { id: 'p1', isProduction: true },
        { id: 'p2', isProduction: false }
      ]
    };
    assert.equal(envApi.isActiveProfileProduction(env), false);
    env.profile = 'p1';
    assert.equal(envApi.isActiveProfileProduction(env), true);
  });
});
