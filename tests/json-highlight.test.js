'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { highlightJson, highlightVars, isValidJson, escapeHtml } = require('../renderer/lib/json-highlight');

describe('json-highlight', () => {
  it('colorizes keys, strings, numbers, literals and punctuation', () => {
    const html = highlightJson('{"nome":"Ana","idade":30,"ativo":true,"nada":null}');
    assert.ok(html.includes('class="json-key"'));
    assert.ok(html.includes('class="json-string"'));
    assert.ok(html.includes('class="json-number"'));
    assert.ok(html.includes('class="json-literal"'));
    assert.ok(html.includes('class="json-punct"'));
    assert.ok(html.includes('&quot;nome&quot;'));
  });

  it('does not mark values as keys (only strings followed by colon)', () => {
    const html = highlightJson('{"a":"b:c"}');
    const keyCount = (html.match(/json-key/g) || []).length;
    const strCount = (html.match(/json-string/g) || []).length;
    assert.equal(keyCount, 1);
    assert.equal(strCount, 1);
  });

  it('escapes HTML inside JSON strings (XSS safe)', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const html = highlightJson(JSON.stringify({ msg: payload }));
    assert.ok(!html.includes('<img'));
    assert.ok(!html.includes('onerror=alert(1)>'));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  });

  it('handles nested arrays/objects', () => {
    const html = highlightJson('{"items":[{"id":1},{"id":2}]}');
    assert.ok((html.match(/json-number/g) || []).length >= 2);
    assert.ok((html.match(/json-key/g) || []).length >= 3);
  });

  it('tokenizes invalid JSON gracefully without throwing', () => {
    const broken = '{"a": 1, "b": } trailing <script>';
    const html = highlightJson(broken);
    assert.equal(typeof html, 'string');
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });

  it('isValidJson detects valid and invalid payloads', () => {
    assert.equal(isValidJson('{"a":1}'), true);
    assert.equal(isValidJson('[1,2,3]'), true);
    assert.equal(isValidJson('{"a":}'), false);
    assert.equal(isValidJson(''), false);
    assert.equal(isValidJson('not json'), false);
    assert.equal(isValidJson('{"x":"<img src=x onerror=alert(1)>"}'), true);
  });

  it('escapeHtml covers all metacharacters', () => {
    assert.equal(escapeHtml(`<>&"'`), '&lt;&gt;&amp;&quot;&#39;');
  });
});

describe('json-highlight: variáveis {{var}}', () => {
  const classifier = (key) => (key === 'base_url' || key === '$guid' ? 'ok' : 'missing');

  it('highlightVars marca variável resolvida verde e não resolvida vermelha', () => {
    const html = highlightVars('GET {{base_url}}/x {{nao_existe}}', classifier);
    assert.ok(html.includes('class="var-ok"'));
    assert.ok(html.includes('class="var-missing"'));
    assert.ok(html.includes('{{base_url}}'));
    assert.ok(html.includes('{{nao_existe}}'));
  });

  it('highlightVars escapa HTML ao redor das variáveis', () => {
    const html = highlightVars('<b>{{base_url}}</b>', classifier);
    assert.ok(!html.includes('<b>'));
    assert.ok(html.includes('&lt;b&gt;'));
  });

  it('highlightJson injeta spans de variável dentro de strings JSON', () => {
    const html = highlightJson('{"url":"{{base_url}}/posts"}', { varClassifier: classifier });
    assert.ok(html.includes('json-string'));
    assert.ok(html.includes('var-ok'));
    assert.ok(!html.includes('var-missing'));
  });

  it('highlightJson marca variável ausente como var-missing', () => {
    const html = highlightJson('{"url":"{{fantasma}}"}', { varClassifier: classifier });
    assert.ok(html.includes('var-missing'));
  });

  it('sem classifier, highlightJson não emite spans de variável', () => {
    const html = highlightJson('{"url":"{{base_url}}"}');
    assert.ok(!html.includes('var-ok'));
    assert.ok(!html.includes('var-missing'));
    assert.ok(html.includes('{{base_url}}'));
  });

  it('classifier null não envolve a variável', () => {
    const html = highlightVars('{{x}}', () => null);
    assert.ok(!html.includes('var-ok'));
    assert.ok(!html.includes('var-missing'));
    assert.ok(html.includes('{{x}}'));
  });
});
