'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { compileRoutes, matchRoute } = require('../../renderer/lib/route-matcher');

describe('route-matcher', () => {
  it('prefers literal routes over param routes and ignores query string', () => {
    const routes = compileRoutes([
      { id: '1', method: 'GET', url: '{{base_url}}/users/:id' },
      { id: '2', method: 'GET', url: '{{base_url}}/users/me' }
    ]);

    const m1 = matchRoute(routes, 'GET', '/users/me?verbose=1');
    assert.equal(m1.route.item.id, '2');

    const m2 = matchRoute(routes, 'GET', '/users/42/');
    assert.equal(m2.route.item.id, '1');
    assert.equal(m2.params.id, '42');
  });
});
