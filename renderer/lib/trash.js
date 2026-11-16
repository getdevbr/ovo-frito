(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.trashLib = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SENSITIVE_HEADERS = new Set(['authorization', 'proxy-authorization', 'cookie', 'set-cookie', 'x-api-key']);
  const SECRET_AUTH_FIELDS = ['token', 'password', 'clientSecret', 'keyValue', 'secret', 'accessToken', 'refreshToken'];

  function uid(prefix = 'trash') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function scrubValue(v) {
    if (Array.isArray(v)) return v.map(scrubValue);
    if (v && typeof v === 'object') {
      const out = {};
      for (const [k, val] of Object.entries(v)) {
        out[k] = scrubKeyValue(k, val);
      }
      return out;
    }
    return v;
  }

  function scrubKeyValue(key, val) {
    const lk = String(key || '').toLowerCase();
    if (lk === 'secret' && typeof val === 'boolean') return val;
    if (SECRET_AUTH_FIELDS.includes(lk)) return typeof val === 'string' ? '' : val;
    if (SENSITIVE_HEADERS.has(lk) && typeof val === 'string') return '';
    if (val && typeof val === 'object') return scrubValue(val);
    return val;
  }

  // Versão segura para disco: esvazia segredos e auth sensível (mesmas regras do serializer .ovo)
  function sanitizeForDisk(item) {
    if (!item || typeof item !== 'object') return item;
    const clone = JSON.parse(JSON.stringify(item));
    if (Array.isArray(clone.variables)) {
      clone.variables = clone.variables.map((v) => (v && v.secret ? { ...v, value: '' } : v));
    }
    const scrubAuth = (auth) => {
      if (!auth || typeof auth !== 'object') return auth;
      const out = { ...auth };
      for (const f of SECRET_AUTH_FIELDS) if (f in out) out[f] = '';
      return out;
    };
    if (clone.auth) clone.auth = scrubAuth(clone.auth);
    if (Array.isArray(clone.headers)) {
      clone.headers = clone.headers.map((h) => (
        h && SENSITIVE_HEADERS.has(String(h.key || '').toLowerCase()) ? { ...h, value: '' } : h
      ));
    }
    if (clone.database && typeof clone.database === 'object') {
      clone.database = { ...clone.database, password: '', connectionString: '' };
    }
    return clone;
  }

  function createEntry({ type, item, origin = {}, now = Date.now(), id } = {}) {
    const name = item?.name || item?.key || type || 'item';
    return {
      id: id || uid('trash'),
      type: String(type || 'item'),
      name: String(name),
      deletedAt: new Date(now).toISOString(),
      origin,
      // snapshot completo só em memória (sessão); em disco vai `disk`
      item: item && typeof item === 'object' ? JSON.parse(JSON.stringify(item)) : item,
      disk: sanitizeForDisk(item)
    };
  }

  function restore(state, entry) {
    if (!state || !entry) return { ok: false };
    const item = entry.item;
    const origin = entry.origin || {};
    switch (entry.type) {
      case 'collection': {
        if (!Array.isArray(state.collections)) state.collections = [];
        const idx = Number.isInteger(origin.index) ? origin.index : state.collections.length;
        state.collections.splice(Math.min(idx, state.collections.length), 0, item);
        return { ok: true, store: 'collections' };
      }
      case 'request': {
        const col = state.collections.find((c) => c.id === origin.collectionId);
        if (!col) return { ok: false, reason: 'collection-missing' };
        if (!Array.isArray(col.items)) col.items = [];
        const idx = Number.isInteger(origin.index) ? origin.index : col.items.length;
        col.items.splice(Math.min(idx, col.items.length), 0, item);
        return { ok: true, store: 'collections' };
      }
      case 'profile':
      case 'environment': { // legado: environments antigos restauram como profiles
        if (!Array.isArray(state.profiles)) state.profiles = [];
        const idx = Number.isInteger(origin.index) ? origin.index : state.profiles.length;
        state.profiles.splice(Math.min(idx, state.profiles.length), 0, item);
        return { ok: true, store: 'profiles' };
      }
      default:
        return { ok: false, reason: 'unknown-type' };
    }
  }

  function purgeExpired(entries, now = Date.now(), days = 30) {
    const cutoff = now - days * 24 * 60 * 60 * 1000;
    return (entries || []).filter((e) => {
      const t = Date.parse(e?.deletedAt || '');
      return Number.isFinite(t) && t >= cutoff;
    });
  }

  // remove `item` do state no índice/origem informados (usado pelo serviço de UI)
  function removeFromState(state, entry) {
    const origin = entry.origin || {};
    switch (entry.type) {
      case 'collection': {
        const idx = state.collections.findIndex((c) => c.id === entry.item?.id);
        if (idx !== -1) state.collections.splice(idx, 1);
        return true;
      }
      case 'request': {
        const col = state.collections.find((c) => c.id === origin.collectionId);
        if (!col) return false;
        const idx = col.items.findIndex((it) => it.id === entry.item?.id);
        if (idx !== -1) col.items.splice(idx, 1);
        return true;
      }
      case 'profile':
      case 'environment': {
        const idx = state.profiles.findIndex((p) => p.id === entry.item?.id);
        if (idx !== -1) state.profiles.splice(idx, 1);
        return true;
      }
      default:
        return false;
    }
  }

  return { createEntry, restore, purgeExpired, sanitizeForDisk, removeFromState, uid };
});
