'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const coreState = require('../../renderer/core/state');
const coreTabs = require('../../renderer/core/tabs');
const coreRequestEditor = require('../../renderer/core/request-editor');

globalThis.uid = coreState.uid;
globalThis.createBlankTab = coreTabs.createBlankTab;
globalThis.syncParamsFromUrl = coreRequestEditor.syncParamsFromUrl;
globalThis.syncUrlFromParams = coreRequestEditor.syncUrlFromParams;
globalThis.interpolateVariables = (value) => String(value ?? '');

const importer = require('../../renderer/core/importer');
const exporter = require('../../renderer/core/exporter');

test('importer.parseCurlCommand converte curl em tab', () => {
  const tab = importer.parseCurlCommand(`curl -X POST 'https://api.test/users?active=true' -H 'Content-Type: application/json' -H 'Authorization: Bearer abc' --data '{"name":"A"}'`);
  assert.equal(tab.method, 'POST');
  assert.equal(tab.url, 'https://api.test/users?active=true');
  assert.equal(tab.body.mode, 'json');
  assert.equal(tab.body.raw, '{"name":"A"}');
  assert.equal(tab.auth.type, 'bearer');
  assert.equal(tab.auth.token, 'abc');
  assert.ok(tab.params.some((p) => p.key === 'active' && p.value === 'true'));
});

test('importer.parseBruFile converte bloco Bruno em tab', () => {
  const bru = `meta {
  name: Get User
}

get {
  url: https://api.test/users/1
}

headers {
  Accept: application/json
  ~X-Debug: true
}

assert {
  res.status: eq 200
}
`;
  const tab = importer.parseBruFile(bru);
  assert.equal(tab.name, 'Get User');
  assert.equal(tab.method, 'GET');
  assert.equal(tab.url, 'https://api.test/users/1');
  assert.equal(tab.headers[0].key, 'Accept');
  assert.equal(tab.headers[1].enabled, false);
  assert.equal(tab.assertions[0].source, 'status');
  assert.equal(tab.assertions[0].operator, '==');
});

test('importer.parseOvoFile reconhece request e collection', () => {
  const req = importer.parseOvoFile(JSON.stringify({ type: 'request', request: { name: 'R', method: 'GET', url: 'https://api.test' } }));
  assert.equal(req.kind, 'request');
  assert.equal(req.tab.name, 'R');

  const col = importer.parseOvoFile(JSON.stringify({ type: 'collection', collection: { name: 'C', items: [{ name: 'I', method: 'GET', url: 'https://api.test/i' }] } }));
  assert.equal(col.kind, 'collection');
  assert.equal(col.collection.name, 'C');
  assert.equal(col.collection.items[0].name, 'I');
});

test('importer converte Postman v2.1 e OpenAPI', () => {
  const pm = importer.convertPostmanCollectionToCarteiro({
    info: { name: 'PM' },
    item: [{ name: 'Get', request: { method: 'GET', url: { raw: 'https://pm.test/items?x=1' }, header: [{ key: 'Accept', value: 'application/json' }] } }]
  });
  assert.equal(pm.name, 'PM');
  assert.equal(pm.items[0].method, 'GET');
  assert.ok(pm.items[0].params.some((p) => p.key === 'x' && p.value === '1'));

  const spec = {
    openapi: '3.0.0',
    info: { title: 'T' },
    servers: [{ url: 'https://api.test/v1' }],
    paths: { '/users': { get: { summary: 'List', responses: {} } } }
  };
  const openApi = importer.convertOpenApiToCarteiro(spec);
  assert.equal(openApi.name, 'T (OpenAPI)');
  assert.equal(openApi.items[0].method, 'GET');
  assert.equal(openApi.items[0].url, 'https://api.test/v1/users');
});

test('exporter gera .bru e .ovo sanitizando segredos', () => {
  const tab = {
    name: 'Get',
    method: 'GET',
    url: 'https://api.test/users',
    params: [],
    headers: [
      { key: 'Authorization', value: 'Bearer secret', enabled: true },
      { key: 'Accept', value: 'application/json', enabled: true }
    ],
    auth: { type: 'bearer', token: 'secret' },
    body: { mode: 'none' },
    assertions: [{ source: 'status', operator: '==', target: '200', enabled: true }],
    captures: [],
    history: []
  };

  const bru = exporter.generateBruContent(tab);
  assert.match(bru, /get \{/);
  assert.match(bru, /url: https:\/\/api\.test\/users/);
  assert.match(bru, /res\.status: eq 200/);

  const ovo = JSON.parse(exporter.generateOvoContent(tab));
  assert.equal(ovo.format, 'ovo-frito/v1');
  assert.equal(ovo.request.auth.token, '');
  assert.equal(ovo.request.headers[0].value, '');
  assert.equal(ovo.request.headers[1].value, 'application/json');
});

test('exporter.generateCodeSnippet cobre ovo e bru', () => {
  const tab = { name: 'Get', method: 'GET', url: 'https://api.test', headers: [], auth: { type: 'none' }, body: { mode: 'none' } };
  assert.match(exporter.generateCodeSnippet(tab, 'ovo'), /"format": "ovo-frito\/v1"/);
  assert.match(exporter.generateCodeSnippet(tab, 'bru'), /get \{/);
});
