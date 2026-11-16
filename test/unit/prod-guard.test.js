'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const envApi = require('../../renderer/core/profiles');

describe('U-09 prod guard flag', () => {
  it('detects profile-level production', () => {
    assert.equal(envApi.isActiveProfileProduction({ name: 'prod', isProduction: true }), true);
    assert.equal(envApi.isActiveProfileProduction({ name: 'dev' }), false);
    assert.equal(envApi.isActiveProfileProduction(null), false);
  });

  it('reads flag directly from the profile object', () => {
    const profile = { id: 'p1', name: 'api', isProduction: false };
    assert.equal(envApi.isActiveProfileProduction(profile), false);
    profile.isProduction = true;
    assert.equal(envApi.isActiveProfileProduction(profile), true);
  });
});
