'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { validateRepoUrl, validateBranch, validateSubdir } = require('../../main/services/git-url-validation');

describe('git-url-validation', () => {
  it('accepts https URLs in userpass mode', () => {
    assert.equal(validateRepoUrl('https://github.com/org/repo.git', { credentialMode: 'userpass' }), 'https://github.com/org/repo.git');
    assert.equal(validateRepoUrl('https://gitlab.com/org/repo', { credentialMode: 'userpass' }), 'https://gitlab.com/org/repo');
  });

  it('rejects non-https in userpass mode', () => {
    assert.throws(() => validateRepoUrl('git@github.com:org/repo.git', { credentialMode: 'userpass' }), /https/);
    assert.throws(() => validateRepoUrl('ssh://git@host/repo', { credentialMode: 'userpass' }));
    assert.throws(() => validateRepoUrl('http://insecure/repo', { credentialMode: 'userpass' }));
  });

  it('accepts ssh/scp-like in system mode', () => {
    assert.equal(validateRepoUrl('git@github.com:org/repo.git', { credentialMode: 'system' }), 'git@github.com:org/repo.git');
    assert.equal(validateRepoUrl('ssh://git@host/org/repo.git', { credentialMode: 'system' }), 'ssh://git@host/org/repo.git');
    assert.equal(validateRepoUrl('https://github.com/org/repo.git', { credentialMode: 'system' }), 'https://github.com/org/repo.git');
  });

  it('rejects dangerous URLs in both modes', () => {
    for (const mode of ['userpass', 'system']) {
      for (const bad of [
        'file:///etc/passwd',
        'ext::sh -c touch /tmp/x',
        'https://user:pass@github.com/org/repo.git',
        '-oProxyCommand=calc',
        'C:\\repos\\local',
        '/abs/path/repo',
        '\\\\server\\share\\repo',
        ''
      ]) {
        assert.throws(() => validateRepoUrl(bad, { credentialMode: mode }), undefined, `should reject: ${bad}`);
      }
    }
  });

  it('validates branch names', () => {
    assert.equal(validateBranch('main'), 'main');
    assert.equal(validateBranch('feature/x.y-z'), 'feature/x.y-z');
    assert.equal(validateBranch(''), 'main');
    for (const bad of ['-bad', 'a..b', 'a b', 'a@{1}', 'a?b', 'a*b', 'a[b', 'a\\b', '/abs', 'trail/']) {
      assert.throws(() => validateBranch(bad), undefined, `should reject branch: ${bad}`);
    }
  });

  it('validates subdir paths', () => {
    assert.equal(validateSubdir('minha-collection'), 'minha-collection');
    assert.equal(validateSubdir('a/b/c'), 'a/b/c');
    assert.equal(validateSubdir(''), '.');
    for (const bad of ['../escape', 'a/../../b', '/abs', 'C:\\win', 'a/.git/config']) {
      assert.throws(() => validateSubdir(bad), undefined, `should reject subdir: ${bad}`);
    }
  });
});
