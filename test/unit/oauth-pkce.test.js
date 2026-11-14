'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { createOAuthPkce } = require('../../main/oauth-pkce');

describe('oauth-pkce', () => {
  it('completes authorization code + PKCE callback flow', async () => {
    const pkce = createOAuthPkce({
      timeoutMs: 5000,
      httpEngine: {
        executeHttpRequest: async (spec) => {
          const body = spec.body.urlencoded;
          const map = Object.fromEntries(body.map((b) => [b.key, b.value]));
          assert.equal(map.grant_type, 'authorization_code');
          assert.equal(map.code, 'auth-code-1');
          assert.equal(map.client_id, 'client-1');
          assert.ok(map.code_verifier);
          assert.match(map.redirect_uri, /^http:\/\/127\.0\.0\.1:\d+\/callback$/);
          return { ok: true, body: JSON.stringify({ access_token: 'token-123', token_type: 'Bearer' }) };
        }
      },
      openExternal: (url) => {
        const auth = new URL(url);
        assert.equal(auth.searchParams.get('response_type'), 'code');
        assert.equal(auth.searchParams.get('client_id'), 'client-1');
        assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
        const redirect = auth.searchParams.get('redirect_uri');
        const state = auth.searchParams.get('state');
        const cb = `${redirect}?code=auth-code-1&state=${encodeURIComponent(state)}`;
        http.get(cb, (res) => res.resume());
      }
    });

    const res = await pkce.start({
      authorizationUrl: 'https://auth.example.com/authorize?foo=bar',
      tokenUrl: 'https://auth.example.com/token',
      clientId: 'client-1',
      scopes: 'read write'
    });
    assert.equal(res.ok, true);
    assert.equal(res.tokens.access_token, 'token-123');
    assert.equal(pkce.status().active, false);
  });
});
