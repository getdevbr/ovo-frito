'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { collectionsToMarkdown, collectionsToHtml } = require('../../renderer/lib/api-docs');

describe('api-docs', () => {
  const collections = [{
    id: 'c1',
    name: 'API <Test>',
    description: 'Docs',
    items: [{ id: 'r1', name: 'Login', folder: 'Auth', method: 'POST', url: '{{base_url}}/login', auth: { type: 'bearer' }, body: { mode: 'json' }, assertions: [{ enabled: true }] }]
  }];

  it('generates markdown table', () => {
    const md = collectionsToMarkdown(collections, { title: 'Docs' });
    assert.match(md, /# Docs/);
    assert.match(md, /\| Auth \/ Login \| POST \| \{\{base_url\}\}\/login \| bearer \| json \| 1 \|/);
  });

  it('escapes html', () => {
    const html = collectionsToHtml(collections);
    assert.match(html, /API &lt;Test&gt;/);
    assert.doesNotMatch(html, /API <Test>/);
  });
});
