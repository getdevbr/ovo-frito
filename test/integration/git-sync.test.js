'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { createStorage } = require('../../main/storage');
const { createCookieJar } = require('../../main/cookie-jar');
const { createHttpEngine } = require('../../main/http-engine');
const { createVault } = require('../../main/vault');
const { createFolderSync } = require('../../main/services/folder-sync');
const { createSyncDirs } = require('../../main/services/sync-dirs');
const { createGitRunner } = require('../../main/services/git-runner');
const { createGitSync } = require('../../main/services/git-sync');

function git(cmdArgs, cwd) {
  return execFileSync('git', cmdArgs, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

describe('git-sync integration', { timeout: 120000 }, () => {
  let tmpDir, dataDir, remoteDir, seedDir, otherDir;
  let storage, folderSync, syncDirs, gitRunner, gitSync, vault;
  let hasGit = true;

  before(async () => {
    try {
      execFileSync('git', ['--version'], { stdio: 'ignore' });
    } catch {
      hasGit = false;
      return;
    }
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdo-git-'));
    dataDir = path.join(tmpDir, 'data');
    remoteDir = path.join(tmpDir, 'remote.git');
    seedDir = path.join(tmpDir, 'seed');
    otherDir = path.join(tmpDir, 'other');
    fs.mkdirSync(dataDir, { recursive: true });

    storage = createStorage({ dataDir });
    storage.ensurePortableDataDir();
    const cookieJar = createCookieJar(storage);
    vault = createVault({ storage });
    const httpEngine = createHttpEngine({ storage, cookieJar, vault });
    folderSync = createFolderSync({ storage });
    syncDirs = createSyncDirs({ storage });
    gitRunner = createGitRunner({ baseDir: dataDir, allowFileProtocol: true });
    gitSync = createGitSync({ storage, vault, folderSync, syncDirs, gitRunner, dataDir });

    // remote bare + seed inicial
    git(['init', '--bare', remoteDir], tmpDir);
    git(['symbolic-ref', 'HEAD', 'refs/heads/main'], remoteDir);
    git(['clone', remoteDir, seedDir], tmpDir);
    git(['config', 'core.autocrlf', 'false'], seedDir);
    git(['config', 'user.email', 't@t.dev'], seedDir);
    git(['config', 'user.name', 'Tester'], seedDir);
    fs.writeFileSync(path.join(seedDir, 'README.md'), 'seed\n');
    git(['add', '-A'], seedDir);
    git(['commit', '-m', 'seed'], seedDir);
    git(['push', '-u', 'origin', 'HEAD:main'], seedDir);
    // fallback se o init default não for main
    try { git(['branch', '-M', 'main'], seedDir); git(['push', '-u', 'origin', 'main'], seedDir); } catch {}

    // collection no storage
    storage.writeStore('collections', [{
      id: 'col1',
      name: 'Minha API',
      items: [{
        id: 'req1',
        name: 'Get Users',
        method: 'GET',
        url: 'https://api.example.com/users',
        headers: [],
        body: { mode: 'none' }
      }]
    }]);

    // repo já "conectado": clone local do remote + registro em settings
    const repoId = 'repo_test123';
    const cloneDir = path.join(dataDir, 'git-repos', repoId);
    fs.mkdirSync(path.dirname(cloneDir), { recursive: true });
    git(['-c', 'core.autocrlf=false', 'clone', remoteDir, cloneDir], dataDir);
    git(['checkout', '-B', 'main'], cloneDir);
    git(['config', 'user.email', 't@t.dev'], cloneDir);
    git(['config', 'user.name', 'Tester'], cloneDir);

    const settings = storage.readStore('settings') || {};
    settings.gitSync = { repos: [{
      id: repoId,
      collectionId: 'col1',
      url: remoteDir,
      branch: 'main',
      subdir: 'minha-api',
      credentialMode: 'system',
      username: '',
      authorName: 'Tester',
      authorEmail: 't@t.dev',
      autoSyncMinutes: 0,
      lastSyncAt: null,
      lastSyncStatus: null
    }] };
    storage.writeStore('settings', settings);
  });

  after(async () => {
    gitSync?.stop?.();
    folderSync?.stop?.();
  });

  it('detects git', async () => {
    if (!hasGit) return;
    const res = await gitSync.detect();
    assert.equal(res.ok, true);
  });

  it('sync commits .ovo files and pushes to remote', async () => {
    if (!hasGit) return;
    const res = await gitSync.sync('repo_test123');
    assert.equal(res.ok, true, JSON.stringify(res));

    // remoto deve conter collection.ovo + request .ovo na subpasta
    git(['-c', 'core.autocrlf=false', 'clone', remoteDir, otherDir], tmpDir);
    const colMeta = path.join(otherDir, 'minha-api', 'collection.ovo');
    const reqFile = fs.readdirSync(path.join(otherDir, 'minha-api')).find((f) => f.endsWith('.ovo') && f !== 'collection.ovo');
    assert.ok(fs.existsSync(colMeta), 'collection.ovo deve existir no remoto');
    assert.ok(reqFile, 'request .ovo deve existir no remoto');
    const parsed = JSON.parse(fs.readFileSync(colMeta, 'utf8'));
    assert.equal(parsed.name, 'Minha API');
  });

  it('pull brings remote changes into the working clone', async () => {
    if (!hasGit) return;
    // outra máquina altera arquivo remoto
    fs.writeFileSync(path.join(otherDir, 'minha-api', 'extra.txt'), 'from-other-machine\n');
    git(['add', '-A'], otherDir);
    git(['-c', 'user.email=o@o.dev', '-c', 'user.name=Other', 'commit', '-m', 'remote change'], otherDir);
    git(['push'], otherDir);

    const res = await gitSync.pull('repo_test123');
    assert.equal(res.ok, true, JSON.stringify(res));
    const cloneDir = path.join(dataDir, 'git-repos', 'repo_test123');
    assert.ok(fs.existsSync(path.join(cloneDir, 'minha-api', 'extra.txt')), 'pull deve trazer arquivo remoto');
  });

  it('status reports clean tree after sync+pull', async () => {
    if (!hasGit) return;
    const res = await gitSync.status('repo_test123');
    assert.equal(res.ok, true);
    assert.equal(res.dirty.length, 0, `dirty: ${res.dirty.join(' | ')}`);
    assert.equal(res.ahead, 0);
    assert.equal(res.behind, 0);
  });

  it('conflict is detected, rebase aborted, and resolveConflict(remote) restores remote state', async () => {
    if (!hasGit) return;
    const cloneDir = path.join(dataDir, 'git-repos', 'repo_test123');
    const metaPath = path.join(cloneDir, 'minha-api', 'collection.ovo');

    // remoto muda a mesma linha que o local vai mudar
    const remoteMeta = JSON.parse(fs.readFileSync(path.join(otherDir, 'minha-api', 'collection.ovo'), 'utf8'));
    remoteMeta.name = 'Remote Name';
    fs.writeFileSync(path.join(otherDir, 'minha-api', 'collection.ovo'), JSON.stringify(remoteMeta, null, 2));
    git(['add', '-A'], otherDir);
    git(['-c', 'user.email=o@o.dev', '-c', 'user.name=Other', 'commit', '-m', 'remote rename'], otherDir);
    git(['push'], otherDir);

    // local muda o mesmo arquivo de forma conflitante
    const localMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    localMeta.name = 'Local Name';
    fs.writeFileSync(metaPath, JSON.stringify(localMeta, null, 2));
    git(['add', '-A'], cloneDir);
    git(['-c', 'user.email=t@t.dev', '-c', 'user.name=Tester', 'commit', '-m', 'local rename'], cloneDir);

    const events = [];
    gitSync.on('git:conflict', (p) => events.push(p));
    const res = await gitSync.sync('repo_test123');
    assert.equal(res.ok, false);
    assert.equal(res.code, 'GIT_CONFLICT');
    assert.ok(events.length >= 1, 'evento pm:git:conflict deve ter sido emitido');

    // rebase foi abortado: working tree deve estar limpo de conflito
    const st = git(['status', '--porcelain'], cloneDir);
    assert.equal(st, '');

    // resolveConflict remote → arquivo volta ao conteúdo remoto
    const rr = await gitSync.resolveConflict('repo_test123', { strategy: 'remote' });
    assert.equal(rr.ok, true);
    const after = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    assert.equal(after.name, 'Remote Name');
  });

  it('credentials are stored only in vault, never in settings or git config', async () => {
    if (!hasGit) return;
    vault.unlock('pw');
    // simula repo userpass apontando para remote local via file path não é possível;
    // verifica que settings.gitSync.repos não contém senha e .git/config não contém credenciais
    const settings = storage.readStore('settings');
    const repo = settings.gitSync.repos[0];
    assert.equal(repo.credentialMode, 'system');
    assert.ok(!('password' in repo));
    const cloneDir = path.join(dataDir, 'git-repos', 'repo_test123');
    const gitConfig = fs.readFileSync(path.join(cloneDir, '.git', 'config'), 'utf8');
    assert.ok(!/password|token|s3nh/i.test(gitConfig));
  });
});
