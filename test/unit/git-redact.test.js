'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { createGitRunner } = require('../../main/services/git-runner');

describe('git-runner redact', () => {
  const runner = createGitRunner({ baseDir: require('node:os').tmpdir() });

  it('redacts password, username and credentialed URLs', () => {
    const out = runner.redact(
      'fatal: https://fulano:s3nh4-T0ken@github.com/org/repo.git auth failed for user fulano pass s3nh4-T0ken',
      ['s3nh4-T0ken', 'fulano']
    );
    assert.ok(!out.includes('s3nh4-T0ken'));
    assert.ok(!out.includes('fulano:s3nh4'));
    assert.ok(!/https?:\/\/[^/\s]+:[^@\s]+@/.test(out));
  });

  it('keeps short secrets untouched threshold but still redacts URL creds', () => {
    const out = runner.redact('err https://u:p@h/r.git', ['abc']);
    assert.ok(!out.includes('u:p@'));
  });
});
