'use strict';

const crypto = require('node:crypto');

const PBKDF2_ITERATIONS = 120000;
const KEY_LEN = 32;

function b64(buf) {
  return Buffer.from(buf).toString('base64');
}

function fromB64(str) {
  return Buffer.from(String(str || ''), 'base64');
}

function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(String(password || ''), salt, PBKDF2_ITERATIONS, KEY_LEN, 'sha256');
}

function encryptSecret(password, plaintext) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveKey(password, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext ?? ''), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `cdo1.${b64(salt)}.${b64(iv)}.${b64(tag)}.${b64(ct)}`;
}

function decryptSecret(password, payload) {
  const parts = String(payload || '').split('.');
  if (parts.length !== 5 || parts[0] !== 'cdo1') throw new Error('Payload do cofre inválido');
  const salt = fromB64(parts[1]);
  const iv = fromB64(parts[2]);
  const tag = fromB64(parts[3]);
  const ct = fromB64(parts[4]);
  const key = deriveKey(password, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

function createVault({ storage, fileName = 'vault.enc.json' } = {}) {
  let unlocked = false;
  let password = null;
  let secrets = {};

  function vaultPath() {
    return require('node:path').join(storage?.dataDir || process.cwd(), fileName);
  }

  function loadEncrypted() {
    try {
      const fs = require('node:fs');
      const p = vaultPath();
      if (!fs.existsSync(p)) return null;
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      return null;
    }
  }

  function persist() {
    const fs = require('node:fs');
    const path = require('node:path');
    const p = vaultPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const encrypted = {};
    for (const [k, v] of Object.entries(secrets)) {
      encrypted[k] = encryptSecret(password, v);
    }
    const tmp = p + `.tmp-${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, secrets: encrypted }, null, 2), { encoding: 'utf8', mode: 0o600 });
    try {
      fs.chmodSync(tmp, 0o600);
    } catch {}
    fs.renameSync(tmp, p);
    try {
      fs.chmodSync(p, 0o600);
    } catch {}
  }

  function unlock(pass) {
    if (!pass) return { ok: false, error: 'Master password obrigatória' };
    const candidate = String(pass);
    const existing = loadEncrypted();
    const next = {};
    if (existing?.secrets) {
      for (const [k, v] of Object.entries(existing.secrets || {})) {
        try {
          next[k] = decryptSecret(candidate, v);
        } catch {
          return { ok: false, error: 'Master password incorreta ou cofre corrompido' };
        }
      }
    }
    secrets = next;
    password = candidate;
    unlocked = true;
    return { ok: true, count: Object.keys(secrets).length };
  }

  function lock() {
    unlocked = false;
    password = null;
    secrets = {};
    return { ok: true };
  }

  function status() {
    return { ok: true, unlocked, count: unlocked ? Object.keys(secrets).length : 0 };
  }

  function setSecret(key, value) {
    if (!unlocked) return { ok: false, error: 'Cofre bloqueado' };
    const k = String(key || '').trim();
    if (!k) return { ok: false, error: 'Chave obrigatória' };
    secrets[k] = String(value ?? '');
    persist();
    return { ok: true };
  }

  function getSecret(key) {
    if (!unlocked) return { ok: false, error: 'Cofre bloqueado' };
    const k = String(key || '').trim();
    if (!(k in secrets)) return { ok: false, error: 'Segredo não encontrado' };
    return { ok: true, value: secrets[k] };
  }

  function deleteSecret(key) {
    if (!unlocked) return { ok: false, error: 'Cofre bloqueado' };
    const k = String(key || '').trim();
    if (!(k in secrets)) return { ok: false, error: 'Segredo não encontrado' };
    delete secrets[k];
    persist();
    return { ok: true };
  }

  function listKeys() {
    if (!unlocked) return { ok: false, error: 'Cofre bloqueado' };
    return { ok: true, keys: Object.keys(secrets).sort() };
  }

  return { unlock, lock, status, setSecret, getSecret, deleteSecret, listKeys, encryptSecret: (p) => encryptSecret(password, p), decryptSecret: (p) => decryptSecret(password, p) };
}

module.exports = { createVault, encryptSecret, decryptSecret };
