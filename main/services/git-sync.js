'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { CdoError } = require('../errors');
const { validateRepoUrl, validateBranch, validateSubdir } = require('./git-url-validation');
const { resolveSafePath } = require('./folder-sync');

const SYNCED_FILE = '.gitignore';

function repoIdFor(url) {
  return 'repo_' + crypto.createHash('sha256').update(String(url)).digest('hex').slice(0, 12);
}

function slugify(name) {
  return String(name || 'collection')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'collection';
}

function porcelainPath(line) {
  return String(line).replace(/^[MADRCU?! ]{1,2}\s+/, '').trim();
}

function createGitSync({ storage, vault, folderSync, syncDirs, gitRunner, dataDir, broadcast = () => {} } = {}) {
  const emitter = new EventEmitter();
  const timers = new Map();
  const reposRoot = path.join(dataDir || process.cwd(), 'git-repos');

  function emit(channel, payload) {
    try { broadcast(channel, payload); } catch {}
    emitter.emit(channel.replace(/^pm:/, ''), payload);
  }

  function loadSettings() {
    const settings = storage.readStore('settings') || {};
    if (!settings.gitSync || typeof settings.gitSync !== 'object') settings.gitSync = { repos: [] };
    if (!Array.isArray(settings.gitSync.repos)) settings.gitSync.repos = [];
    return settings;
  }

  function saveSettings(settings) {
    storage.writeStore('settings', settings);
  }

  function listRepos() {
    return loadSettings().gitSync.repos.map((r) => ({ ...r }));
  }

  function findRepo(repoId) {
    return loadSettings().gitSync.repos.find((r) => r.id === repoId) || null;
  }

  function upsertRepo(repo) {
    const settings = loadSettings();
    const idx = settings.gitSync.repos.findIndex((r) => r.id === repo.id);
    if (idx >= 0) settings.gitSync.repos[idx] = { ...settings.gitSync.repos[idx], ...repo };
    else settings.gitSync.repos.push(repo);
    saveSettings(settings);
  }

  function removeRepo(repoId) {
    const settings = loadSettings();
    settings.gitSync.repos = settings.gitSync.repos.filter((r) => r.id !== repoId);
    saveSettings(settings);
  }

  function repoPath(repo) {
    return path.join(reposRoot, repo.id);
  }

  function workPath(repo) {
    return repo.subdir && repo.subdir !== '.' ? path.join(repoPath(repo), repo.subdir) : repoPath(repo);
  }

  function vaultKey(repoId) {
    return `git:${repoId}`;
  }

  function vaultUnlocked() {
    try { return Boolean(vault && vault.status && vault.status().unlocked); } catch { return false; }
  }

  function loadCredentials(repo) {
    if (repo.credentialMode !== 'userpass') return { username: '', password: '' };
    if (!vaultUnlocked()) {
      throw new CdoError('VAULT_LOCKED', 'Cofre bloqueado. Desbloqueie para operações Git remotas.');
    }
    const res = vault.getSecret(vaultKey(repo.id));
    if (!res || res.ok !== true) {
      throw new CdoError('GIT_AUTH_FAILED', 'Credenciais Git não configuradas para este repositório.');
    }
    try {
      const parsed = JSON.parse(res.value);
      return { username: String(parsed.username || ''), password: String(parsed.password || '') };
    } catch {
      throw new CdoError('GIT_AUTH_FAILED', 'Credenciais Git corrompidas no cofre.');
    }
  }

  function gitEnvFor(repo, creds) {
    const { env, prefixArgs } = gitRunner.buildEnv({
      credentialMode: repo.credentialMode || 'userpass',
      username: creds.username,
      password: creds.password
    });
    return { env, prefixArgs, secrets: [creds.password, creds.username].filter((s) => s && String(s).length >= 4) };
  }

  async function git(repo, args, { creds, cwd, timeoutMs = 120000 } = {}) {
    const c = creds || (repo ? loadCredentials(repo) : { username: '', password: '' });
    const { env, prefixArgs, secrets } = repo ? gitEnvFor(repo, c) : { env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, prefixArgs: [], secrets: [] };
    const workDir = cwd || (repo ? workPath(repo) : reposRoot);
    const res = await gitRunner.runGit([...prefixArgs, ...args], { cwd: workDir, env, timeoutMs });
    return { ...res, _secrets: secrets };
  }

  function ensureGitignore(repo) {
    const dir = workPath(repo);
    fs.mkdirSync(dir, { recursive: true });
    const gi = path.join(dir, SYNCED_FILE);
    if (!fs.existsSync(gi)) {
      fs.writeFileSync(gi, '*.tmp\n', 'utf8');
    }
  }

  async function detect() {
    return gitRunner.detectGit();
  }

  async function testConnection({ url, credentialMode = 'userpass', username = '', password = '' } = {}) {
    const validUrl = validateRepoUrl(url, { credentialMode });
    const det = await gitRunner.detectGit();
    if (!det.ok) return det;
    const { env, prefixArgs } = gitRunner.buildEnv({ credentialMode, username, password });
    const res = await gitRunner.runGit([...prefixArgs, 'ls-remote', '--heads', validUrl], {
      cwd: reposRoot,
      env,
      timeoutMs: 60000
    });
    if (!res.ok) {
      const authFail = /authentication|permission|403|401|could not read|terminal prompts disabled/i.test(`${res.stderr} ${res.message}`);
      return {
        ok: false,
        code: authFail ? 'GIT_AUTH_FAILED' : 'GIT_ERROR',
        message: authFail
          ? 'Falha de autenticação. No GitHub/GitLab/Bitbucket use Personal Access Token no campo senha (a senha da conta não funciona em HTTPS).'
          : gitRunner.redact(res.stderr || res.message, [password, username])
      };
    }
    return { ok: true, heads: res.stdout.split('\n').filter(Boolean).length };
  }

  async function connect(payload = {}) {
    const collectionId = String(payload.collectionId || '');
    const collections = storage.readStore('collections') || [];
    const col = collections.find((c) => c.id === collectionId);
    if (!col) throw new CdoError('NOT_FOUND', `Collection não encontrada: ${collectionId}`);

    const credentialMode = payload.credentialMode === 'system' ? 'system' : 'userpass';
    const url = validateRepoUrl(payload.url, { credentialMode });
    const branch = validateBranch(payload.branch);
    const subdir = validateSubdir(payload.subdir || slugify(col.name));
    const id = repoIdFor(url);
    const dest = path.join(reposRoot, id);

    const det = await gitRunner.detectGit();
    if (!det.ok) return det;

    emit('pm:git:progress', { repoId: id, stage: 'clone', message: 'Clonando repositório...' });

    const creds = credentialMode === 'userpass'
      ? { username: String(payload.username || ''), password: String(payload.password || '') }
      : { username: '', password: '' };
    if (credentialMode === 'userpass' && (!creds.username || !creds.password)) {
      throw new CdoError('GIT_AUTH_FAILED', 'Informe usuário e senha/token para o modo usuário/senha.');
    }
    const { env, prefixArgs, secrets } = gitEnvFor({ id, credentialMode }, creds);

    fs.mkdirSync(reposRoot, { recursive: true });
    if (fs.existsSync(dest)) {
      // já existe: reusa sem apagar
    } else {
      const cloneArgs = [...prefixArgs, 'clone', '--branch', branch, '--single-branch', '--', url, dest];
      let res = await gitRunner.runGit(cloneArgs, { cwd: reposRoot, env, timeoutMs: 300000 });
      if (!res.ok) {
        // branch pode não existir no remoto: init + fetch da branch; se falhar, branch nova no primeiro push
        fs.rmSync(dest, { recursive: true, force: true });
        fs.mkdirSync(dest, { recursive: true });
        await gitRunner.runGit([...prefixArgs, 'init', '-b', branch, '--', dest], { cwd: reposRoot, env });
        await gitRunner.runGit([...prefixArgs, '-C', dest, 'remote', 'add', 'origin', url], { cwd: reposRoot, env });
        const fetchRes = await gitRunner.runGit([...prefixArgs, '-C', dest, 'fetch', '--depth', '1', 'origin', branch], { cwd: reposRoot, env, timeoutMs: 120000 });
        if (fetchRes.ok) {
          await gitRunner.runGit([...prefixArgs, '-C', dest, 'reset', '--hard', 'FETCH_HEAD'], { cwd: reposRoot, env });
        }
        res = { ok: true };
      }
      if (!res.ok) {
        return {
          ok: false,
          code: 'GIT_ERROR',
          message: gitRunner.redact(res.stderr || res.message, secrets)
        };
      }
    }

    // credenciais → cofre (nunca em settings/disco)
    if (credentialMode === 'userpass') {
      if (!vaultUnlocked()) throw new CdoError('VAULT_LOCKED', 'Cofre bloqueado. Desbloqueie para salvar credenciais Git no cofre.');
      vault.setSecret(vaultKey(id), JSON.stringify({ username: creds.username, password: creds.password }));
    } else {
      if (vaultUnlocked()) {
        try { vault.deleteSecret(vaultKey(id)); } catch {}
      }
    }

    const workDir = path.join(dest, ...subdir.split('/').filter(Boolean));
    const repo = {
      id,
      collectionId,
      url,
      branch,
      subdir,
      credentialMode,
      username: credentialMode === 'userpass' ? creds.username : '',
      authorName: String(payload.authorName || ''),
      authorEmail: String(payload.authorEmail || ''),
      autoSyncMinutes: Math.max(0, Number(payload.autoSyncMinutes) || 0),
      lastSyncAt: null,
      lastSyncStatus: null
    };
    upsertRepo(repo);

    // aprova diretório e ativa folder sync na subpasta
    syncDirs?.approve?.(workDir);
    fs.mkdirSync(workDir, { recursive: true });
    ensureGitignore(repo);
    folderSync?.flushCollection?.(col, workDir);
    folderSync?.enable?.({ collectionId, dirPath: workDir });

    scheduleAutoSync(repo);

    emit('pm:git:synced', { repoId: id, ok: true });
    return { ok: true, repo };
  }

  function scheduleAutoSync(repo) {
    if (timers.has(repo.id)) {
      clearInterval(timers.get(repo.id));
      timers.delete(repo.id);
    }
    const minutes = Number(repo.autoSyncMinutes) || 0;
    if (minutes < 5) return;
    const timer = setInterval(() => {
      sync(repo.id).catch((err) => {
        emit('pm:git:progress', { repoId: repo.id, stage: 'autosync', message: err?.message || String(err) });
      });
    }, minutes * 60 * 1000);
    timer.unref?.();
    timers.set(repo.id, timer);
  }

  async function status(repoId) {
    const repo = findRepo(repoId);
    if (!repo) throw new CdoError('NOT_FOUND', `Repositório Git não configurado: ${repoId}`);
    const root = repoPath(repo);
    if (!fs.existsSync(path.join(root, '.git'))) {
      return { ok: true, repo, cloned: false, dirty: [], ahead: 0, behind: 0 };
    }
    const st = await git(repo, ['status', '--porcelain'], { cwd: root });
    const dirty = st.ok ? st.stdout.split('\n').filter(Boolean).map(porcelainPath) : [];
    let ahead = 0, behind = 0;
    const counts = await git(repo, ['rev-list', '--left-right', '--count', `${repo.branch}...origin/${repo.branch}`], { cwd: root });
    if (counts.ok) {
      const parts = counts.stdout.trim().split(/\s+/);
      ahead = Number(parts[0]) || 0;
      behind = Number(parts[1]) || 0;
    }
    return { ok: true, repo, cloned: true, dirty, ahead, behind };
  }

  async function pull(repoId) {
    const repo = findRepo(repoId);
    if (!repo) throw new CdoError('NOT_FOUND', `Repositório Git não configurado: ${repoId}`);
    emit('pm:git:progress', { repoId, stage: 'pull', message: 'git pull --rebase...' });
    const res = await git(repo, ['pull', '--rebase', '--autostash', 'origin', repo.branch], { cwd: repoPath(repo), timeoutMs: 180000 });
    if (!res.ok) {
      const conflict = await detectConflict(repo);
      if (conflict) {
        await git(repo, ['rebase', '--abort'], { cwd: repoPath(repo) }).catch(() => {});
        upsertRepo({ ...repo, lastSyncStatus: 'conflict' });
        emit('pm:git:conflict', { repoId, files: conflict });
        return { ok: false, code: 'GIT_CONFLICT', files: conflict };
      }
      return { ok: false, code: 'GIT_ERROR', message: gitRunner.redact(res.stderr || res.message, res._secrets) };
    }
    upsertRepo({ ...repo, lastSyncAt: new Date().toISOString(), lastSyncStatus: 'ok' });
    return { ok: true };
  }

  async function push(repoId) {
    const repo = findRepo(repoId);
    if (!repo) throw new CdoError('NOT_FOUND', `Repositório Git não configurado: ${repoId}`);
    emit('pm:git:progress', { repoId, stage: 'push', message: 'git push...' });
    let res = await git(repo, ['push', 'origin', repo.branch], { cwd: repoPath(repo), timeoutMs: 180000 });
    if (!res.ok && /no upstream|has no upstream|src refspec/i.test(res.stderr)) {
      res = await git(repo, ['push', '-u', 'origin', `${repo.branch}:${repo.branch}`], { cwd: repoPath(repo), timeoutMs: 180000 });
    }
    if (!res.ok) {
      return { ok: false, code: 'GIT_ERROR', message: gitRunner.redact(res.stderr || res.message, res._secrets) };
    }
    upsertRepo({ ...repo, lastSyncAt: new Date().toISOString(), lastSyncStatus: 'ok' });
    return { ok: true };
  }

  async function detectConflict(repo) {
    const st = await git(repo, ['status', '--porcelain'], { cwd: repoPath(repo) });
    if (!st.ok) return null;
    const unmerged = st.stdout.split('\n').filter((l) => /^(UU|AA|UD|DU|AU|UA|DD)/.test(l)).map(porcelainPath);
    return unmerged.length ? unmerged : null;
  }

  async function sync(repoId, { commitMessage } = {}) {
    const repo = findRepo(repoId);
    if (!repo) throw new CdoError('NOT_FOUND', `Repositório Git não configurado: ${repoId}`);
    emit('pm:git:progress', { repoId, stage: 'sync', message: 'Sincronizando...' });

    // 1. flush garante disco atualizado
    const collections = storage.readStore('collections') || [];
    const col = collections.find((c) => c.id === repo.collectionId);
    if (col) {
      folderSync?.flushCollection?.(col, workPath(repo));
    }

    const root = repoPath(repo);
    const rel = repo.subdir === '.' ? '.' : repo.subdir;

    // 2. add + commit se houver mudanças
    await git(repo, ['add', '-A', '--', rel], { cwd: root });
    const diff = await git(repo, ['diff', '--cached', '--quiet', '--', rel], { cwd: root });
    if (!diff.ok) {
      const colName = col?.name || repo.collectionId;
      const message = commitMessage || `Ovo Frito: atualiza ${colName} (${new Date().toISOString()})`;
      const authorArgs = [];
      if (repo.authorName) authorArgs.push('-c', `user.name=${repo.authorName}`);
      if (repo.authorEmail) authorArgs.push('-c', `user.email=${repo.authorEmail}`);
      const commit = await git(repo, [...authorArgs, 'commit', '-m', message, '--', rel], { cwd: root });
      if (!commit.ok) {
        return { ok: false, code: 'GIT_ERROR', message: gitRunner.redact(commit.stderr || commit.message, commit._secrets) };
      }
    }

    // 3. pull --rebase
    const pullRes = await pull(repoId);
    if (!pullRes.ok) return pullRes;

    // 4. push
    const pushRes = await push(repoId);
    if (!pushRes.ok) return pushRes;

    emit('pm:git:synced', { repoId, ok: true });
    return { ok: true };
  }

  async function resolveConflict(repoId, { strategy } = {}) {
    const repo = findRepo(repoId);
    if (!repo) throw new CdoError('NOT_FOUND', `Repositório Git não configurado: ${repoId}`);
    if (strategy === 'local') {
      // manter local: push com force-with-lease após rebase abort já ter rodado no pull
      const res = await git(repo, ['push', '--force-with-lease', 'origin', repo.branch], { cwd: repoPath(repo), timeoutMs: 180000 });
      if (!res.ok) return { ok: false, code: 'GIT_ERROR', message: gitRunner.redact(res.stderr || res.message, res._secrets) };
      upsertRepo({ ...repo, lastSyncStatus: 'ok' });
      emit('pm:git:synced', { repoId, ok: true });
      return { ok: true };
    }
    if (strategy === 'remote') {
      const res = await git(repo, ['reset', '--hard', `origin/${repo.branch}`], { cwd: repoPath(repo) });
      if (!res.ok) return { ok: false, code: 'GIT_ERROR', message: gitRunner.redact(res.stderr || res.message, res._secrets) };
      upsertRepo({ ...repo, lastSyncStatus: 'ok' });
      // watcher do folder-sync reimporta os .ovo atualizados
      emit('pm:git:synced', { repoId, ok: true });
      return { ok: true };
    }
    throw new CdoError('GIT_STRATEGY_INVALID', 'Estratégia deve ser "local" ou "remote"');
  }

  async function disconnect(repoId, { deleteLocalClone = false } = {}) {
    const repo = findRepo(repoId);
    if (repo) {
      folderSync?.disable?.(repo.collectionId);
      if (timers.has(repoId)) { clearInterval(timers.get(repoId)); timers.delete(repoId); }
      if (vaultUnlocked()) {
        try { vault.deleteSecret(vaultKey(repoId)); } catch {}
      }
      removeRepo(repoId);
      if (deleteLocalClone) {
        fs.rmSync(repoPath(repo), { recursive: true, force: true });
      }
    }
    return { ok: true };
  }

  async function setCredentials(repoId, { username, password } = {}) {
    const repo = findRepo(repoId);
    if (!repo) throw new CdoError('NOT_FOUND', `Repositório Git não configurado: ${repoId}`);
    if (!vaultUnlocked()) throw new CdoError('VAULT_LOCKED', 'Cofre bloqueado. Desbloqueie para salvar credenciais Git.');
    vault.setSecret(vaultKey(repoId), JSON.stringify({ username: String(username || ''), password: String(password || '') }));
    upsertRepo({ ...repo, username: String(username || '') });
    return { ok: true };
  }

  async function clearCredentials(repoId) {
    if (vaultUnlocked()) {
      try { vault.deleteSecret(vaultKey(repoId)); } catch {}
    }
    const repo = findRepo(repoId);
    if (repo) upsertRepo({ ...repo, username: '' });
    return { ok: true };
  }

  function stop() {
    for (const t of timers.values()) clearInterval(t);
    timers.clear();
  }

  return {
    detect,
    testConnection,
    connect,
    status,
    pull,
    push,
    sync,
    resolveConflict,
    disconnect,
    setCredentials,
    clearCredentials,
    listRepos,
    stop,
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter)
  };
}

module.exports = { createGitSync, repoIdFor };
