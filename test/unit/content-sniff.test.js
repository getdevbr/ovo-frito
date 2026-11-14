'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isTextual, extensionFromContentType } = require('../../renderer/lib/content-sniff');

describe('content-sniff', () => {
  it('classifies textual and binary content types', () => {
    assert.equal(isTextual('application/json; charset=utf-8'), true);
    assert.equal(isTextual('text/html'), true);
    assert.equal(isTextual('image/png'), false);
    assert.equal(isTextual('application/pdf'), false);
  });

  it('detects NUL byte in unknown content type', () => {
    assert.equal(isTextual('', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00])), false);
    assert.equal(isTextual('', Buffer.from('hello world')), true);
  });

  it('maps content type to extension', () => {
    assert.equal(extensionFromContentType('image/png'), 'png');
    assert.equal(extensionFromContentType('application/pdf'), 'pdf');
    assert.equal(extensionFromContentType('application/unknown'), 'bin');
  });
});
