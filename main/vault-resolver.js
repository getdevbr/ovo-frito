'use strict';

const VAULT_REF_RE = /\{\{\s*vault\.([A-Za-z0-9_.:\-]+)\s*\}\}/g;

function collectVaultRefs(spec) {
  const keys = new Set();
  const walk = (value) => {
    if (typeof value === 'string') {
      for (const m of value.matchAll(VAULT_REF_RE)) keys.add(m[1]);
    } else if (Array.isArray(value)) {
      for (const item of value) walk(item);
    } else if (value && typeof value === 'object') {
      for (const v of Object.values(value)) walk(v);
    }
  };
  walk(spec);
  return [...keys].sort();
}

function cloneSpec(spec) {
  if (typeof structuredClone === 'function') return structuredClone(spec);
  return JSON.parse(JSON.stringify(spec));
}

function resolveVaultRefs(spec, vault) {
  const refs = collectVaultRefs(spec);
  if (refs.length === 0) {
    return { ok: true, spec: cloneSpec(spec), secrets: new Set(), refs: [] };
  }

  const lockedError = () => ({
    ok: false,
    spec: null,
    secrets: new Set(),
    refs,
    error: {
      code: 'VAULT_LOCKED',
      message: 'Cofre bloqueado. Desbloqueie para usar {{vault.*}}.',
      keys: refs
    }
  });

  if (!vault || typeof vault.getSecret !== 'function' || vault.status?.().unlocked === false) {
    return lockedError();
  }

  const missing = [];
  const resolved = cloneSpec(spec);
  const secrets = new Set();

  const walk = (value) => {
    if (typeof value === 'string') {
      return value.replace(VAULT_REF_RE, (match, key) => {
        const res = vault.getSecret(key);
        if (!res || res.ok !== true) {
          if (!missing.includes(key)) missing.push(key);
          return match;
        }
        const secretValue = String(res.value ?? '');
        if (secretValue) secrets.add(secretValue);
        return secretValue;
      });
    }
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) value[i] = walk(value[i]);
      return value;
    }
    if (value && typeof value === 'object') {
      for (const k of Object.keys(value)) value[k] = walk(value[k]);
      return value;
    }
    return value;
  };

  const out = walk(resolved);

  if (missing.length > 0) {
    return {
      ok: false,
      spec: null,
      secrets: new Set(),
      refs,
      error: {
        code: 'VAULT_KEY_NOT_FOUND',
        message: `Segredo(s) não encontrado(s) no cofre: ${missing.join(', ')}`,
        keys: missing
      }
    };
  }

  return { ok: true, spec: out, secrets, refs };
}

function maskSecrets(value, secrets) {
  if (!secrets || secrets.size === 0) return value;
  const sorted = [...secrets].filter((s) => typeof s === 'string' && s.length > 0).sort((a, b) => b.length - a.length);
  if (sorted.length === 0) return value;

  const maskString = (str) => {
    let out = str;
    for (const secret of sorted) {
      if (out.includes(secret)) out = out.split(secret).join('••••');
    }
    return out;
  };

  const walk = (val) => {
    if (typeof val === 'string') return maskString(val);
    if (Array.isArray(val)) return val.map(walk);
    if (val && typeof val === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(val)) out[k] = walk(v);
      return out;
    }
    return val;
  };

  return walk(value);
}

module.exports = { collectVaultRefs, resolveVaultRefs, maskSecrets, VAULT_REF_RE };
