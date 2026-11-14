'use strict';

const crypto = require('node:crypto');

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function encodeRfc3986(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalQuery(searchParams) {
  const pairs = [];
  for (const [k, v] of searchParams.entries()) {
    pairs.push([encodeRfc3986(k), encodeRfc3986(v)]);
  }
  pairs.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  return pairs.map(([k, v]) => `${k}=${v}`).join('&');
}

function signAwsRequest({ method, url, headers, bodyBuffer, auth }) {
  const accessKey = String(auth?.accessKey || auth?.accessKeyId || '').trim();
  const secretKey = String(auth?.secretKey || '').trim();
  if (!accessKey || !secretKey) return false;

  const region = String(auth.region || 'us-east-1').trim() || 'us-east-1';
  const service = String(auth.service || 'execute-api').trim() || 'execute-api';
  const now = auth.now ? new Date(auth.now) : new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(bodyBuffer && bodyBuffer.length ? bodyBuffer : Buffer.alloc(0));

  for (const key of Object.keys(headers)) {
    const lower = key.toLowerCase();
    if (lower === 'x-amz-date' || lower === 'x-amz-content-sha256' || lower === 'x-amz-security-token' || lower === 'authorization') {
      delete headers[key];
    }
  }
  headers['x-amz-date'] = amzDate;
  headers['x-amz-content-sha256'] = payloadHash;
  if (auth.sessionToken) headers['x-amz-security-token'] = String(auth.sessionToken);

  const lowerHeaders = {};
  for (const [k, v] of Object.entries(headers)) lowerHeaders[k.toLowerCase()] = String(v);

  const headerKeys = ['host', 'x-amz-content-sha256', 'x-amz-date'];
  if (auth.sessionToken) headerKeys.push('x-amz-security-token');
  if (lowerHeaders['content-type']) headerKeys.push('content-type');
  const uniqueKeys = Array.from(new Set(headerKeys)).sort();

  const canonicalHeaderValues = {
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate
  };
  if (auth.sessionToken) canonicalHeaderValues['x-amz-security-token'] = String(auth.sessionToken);
  if (lowerHeaders['content-type']) canonicalHeaderValues['content-type'] = lowerHeaders['content-type'].trim().replace(/\s+/g, ' ');

  const canonicalHeaders = uniqueKeys.map((k) => `${k}:${canonicalHeaderValues[k] || ''}\n`).join('');
  const signedHeaders = uniqueKeys.join(';');
  const canonicalUri = url.pathname || '/';
  const canonicalRequest = [
    String(method || 'GET').toUpperCase(),
    canonicalUri,
    canonicalQuery(url.searchParams),
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  headers['Authorization'] =
    `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return true;
}

function md5Hex(data) {
  return crypto.createHash('md5').update(data).digest('hex');
}

function parseDigestChallenge(headerValue) {
  const value = String(headerValue || '');
  if (!/^digest\b/i.test(value.trim())) return null;
  const out = {};
  const re = /(\w+)=(?:"([^"]*)"|([^,]+))/g;
  let m;
  while ((m = re.exec(value))) {
    out[m[1].toLowerCase()] = (m[2] ?? m[3] ?? '').trim();
  }
  return out.realm ? out : null;
}

function buildDigestAuthorization({ method, uri, username, password, challenge, cnonce, nc = '00000001' }) {
  if (!challenge?.realm || !challenge?.nonce) return null;
  const ha1 = md5Hex(`${username || ''}:${challenge.realm}:${password || ''}`);
  const ha2 = md5Hex(`${String(method || 'GET').toUpperCase()}:${uri}`);
  const qop = challenge.qop ? String(challenge.qop).split(',')[0].trim() : '';
  let response;
  if (qop === 'auth') {
    response = md5Hex(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:${qop}:${ha2}`);
  } else {
    response = md5Hex(`${ha1}:${challenge.nonce}:${ha2}`);
  }
  const parts = [
    `username="${username || ''}"`,
    `realm="${challenge.realm}"`,
    `nonce="${challenge.nonce}"`,
    `uri="${uri}"`
  ];
  if (qop) parts.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  if (challenge.opaque) parts.push(`opaque="${challenge.opaque}"`);
  parts.push(`response="${response}"`);
  return `Digest ${parts.join(', ')}`;
}

function randomCnonce() {
  return crypto.randomBytes(8).toString('hex');
}

module.exports = {
  signAwsRequest,
  parseDigestChallenge,
  buildDigestAuthorization,
  randomCnonce
};
