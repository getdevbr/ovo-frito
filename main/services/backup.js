'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SENSITIVE_HEADERS = new Set(['authorization', 'proxy-authorization', 'cookie', 'set-cookie', 'x-api-key']);
const SECRET_AUTH_FIELDS = ['token', 'password', 'keyValue', 'clientSecret', 'secretKey', 'sessionToken', 'accessToken', 'refreshToken'];

function isSecretLike(val) {
  const s = String(val ?? '');
  return s !== '' && !s.startsWith('{{') && !s.startsWith('@');
}

function sanitizeAuth(auth) {
  if (!auth || typeof auth !== 'object') return auth;
  const out = { ...auth };
  for (const k of SECRET_AUTH_FIELDS) {
    if (k in out && isSecretLike(out[k])) out[k] = '';
  }
  return out;
}

function sanitizeHeaders(headers) {
  if (!Array.isArray(headers)) return [];
  return headers.map((h) => {
    if (!h || typeof h !== 'object') return h;
    if (SENSITIVE_HEADERS.has(String(h.key || '').toLowerCase()) && isSecretLike(h.value)) {
      return { ...h, value: '' };
    }
    return h;
  });
}

function sanitizeCollections(collections) {
  return (Array.isArray(collections) ? collections : []).map((col) => ({
    ...col,
    auth: sanitizeAuth(col.auth || { type: 'none' }),
    variables: (Array.isArray(col.variables) ? col.variables : []).map((v) => (v?.secret ? { ...v, value: '' } : v)),
    items: (Array.isArray(col.items) ? col.items : []).map((it) => ({
      ...it,
      headers: sanitizeHeaders(it.headers),
      auth: sanitizeAuth(it.auth || { type: 'none' })
    }))
  }));
}

function sanitizeProfiles(profiles) {
  return (Array.isArray(profiles) ? profiles : []).map((p) => ({
    ...p,
    database: p.database
      ? {
          ...p.database,
          password: '',
          connectionString: isSecretLike(p.database.connectionString) ? '' : p.database.connectionString
        }
      : undefined,
    variables: (Array.isArray(p.variables) ? p.variables : []).map((v) => (v?.secret ? { ...v, value: '' } : v))
  }));
}

function exportBackup({ storage, dataDir } = {}) {
  const collections = sanitizeCollections(storage?.readStore('collections') || []);
  const profiles = sanitizeProfiles(storage?.readStore('profiles') || []);
  const settings = storage?.readStore('settings') || {};

  let vaultEncrypted = null;
  const baseDir = storage?.dataDir || dataDir;
  if (baseDir) {
    const vPath = path.join(baseDir, 'vault.enc.json');
    if (fs.existsSync(vPath)) {
      try {
        vaultEncrypted = JSON.parse(fs.readFileSync(vPath, 'utf8'));
      } catch {
        vaultEncrypted = null;
      }
    }
  }

  return {
    format: 'ovo-frito-backup/v1',
    exportedAt: new Date().toISOString(),
    collections,
    profiles,
    settings,
    vaultEncrypted
  };
}

function parseAndPreviewBackup(rawInput) {
  const obj = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;
  if (!obj || typeof obj !== 'object' || obj.format !== 'ovo-frito-backup/v1') {
    throw new Error('Arquivo de backup inválido (esperado formato ovo-frito-backup/v1)');
  }
  return {
    ok: true,
    format: obj.format,
    exportedAt: obj.exportedAt || null,
    collectionsCount: Array.isArray(obj.collections) ? obj.collections.length : 0,
    profilesCount: Array.isArray(obj.profiles) ? obj.profiles.length : 0,
    hasSettings: Boolean(obj.settings && typeof obj.settings === 'object'),
    hasVault: Boolean(obj.vaultEncrypted && typeof obj.vaultEncrypted === 'object')
  };
}

function mergeById(existing, incoming) {
  const map = new Map();
  for (const item of existing || []) {
    if (item && item.id) map.set(item.id, item);
  }
  for (const item of incoming || []) {
    if (item && item.id) map.set(item.id, item);
  }
  return Array.from(map.values());
}

function restoreBackup({ storage, dataDir, vault, rawInput, mode = 'merge', restoreVault = true } = {}) {
  const obj = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;
  parseAndPreviewBackup(obj);

  const nextCollections =
    mode === 'replace'
      ? sanitizeCollections(obj.collections || [])
      : mergeById(storage.readStore('collections') || [], sanitizeCollections(obj.collections || []));
  const nextProfiles =
    mode === 'replace'
      ? sanitizeProfiles(obj.profiles || [])
      : mergeById(storage.readStore('profiles') || [], sanitizeProfiles(obj.profiles || []));

  const curSettings = storage.readStore('settings') || {};
  const nextSettings =
    mode === 'replace'
      ? { ...(obj.settings || {}) }
      : { ...curSettings, ...(obj.settings || {}) };

  storage.writeStore('collections', nextCollections);
  storage.writeStore('profiles', nextProfiles);
  storage.writeStore('settings', nextSettings);

  let vaultRestored = false;
  const baseDir = storage?.dataDir || dataDir;
  if (restoreVault && obj.vaultEncrypted && typeof obj.vaultEncrypted === 'object' && baseDir) {
    const vPath = path.join(baseDir, 'vault.enc.json');
    if (mode === 'replace' || !fs.existsSync(vPath)) {
      fs.mkdirSync(path.dirname(vPath), { recursive: true });
      const tmp = `${vPath}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, JSON.stringify(obj.vaultEncrypted, null, 2), { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tmp, vPath);
      vault?.lock?.();
      vaultRestored = true;
    }
  }

  return {
    ok: true,
    collectionsCount: nextCollections.length,
    profilesCount: nextProfiles.length,
    vaultRestored
  };
}

module.exports = {
  exportBackup,
  parseAndPreviewBackup,
  restoreBackup
};
