'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { signAwsRequest, parseDigestChallenge, buildDigestAuthorization } = require('../../main/auth-signers');

describe('auth-signers', () => {
  it('signs AWS SigV4 request deterministically', () => {
    const url = new URL('https://execute-api.us-east-1.amazonaws.com/prod/items?a=1&b=2');
    const headers = { 'Content-Type': 'application/json' };
    const ok = signAwsRequest({
      method: 'POST',
      url,
      headers,
      bodyBuffer: Buffer.from('{"x":1}'),
      auth: {
        accessKey: 'AKIDEXAMPLE',
        secretKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
        region: 'us-east-1',
        service: 'execute-api',
        now: '2015-08-30T12:36:00.000Z'
      }
    });
    assert.equal(ok, true);
    assert.equal(headers['x-amz-date'], '20150830T123600Z');
    assert.match(headers.Authorization, /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20150830\/us-east-1\/execute-api\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
    assert.equal(headers['x-amz-content-sha256'].length, 64);
  });

  it('parses Digest challenge and builds RFC 2617 response', () => {
    const challenge = parseDigestChallenge('Digest realm="testrealm@host.com", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", qop="auth", opaque="5ccc069c403ebaf9f0171e9517f40e41"');
    assert.ok(challenge);
    const auth = buildDigestAuthorization({
      method: 'GET',
      uri: '/dir/index.html',
      username: 'Mufasa',
      password: 'Circle Of Life',
      challenge,
      cnonce: '0a4f113b',
      nc: '00000001'
    });
    assert.match(auth, /username="Mufasa"/);
    assert.match(auth, /response="6629fae49393a05397450978507c4ef1"/);
    assert.match(auth, /qop=auth/);
  });
});
