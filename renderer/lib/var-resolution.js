(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.varResolution = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const REF_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

  const DYNAMIC_KEYS = new Set([
    '$guid', '$uuid', '$timestamp', '$isoTimestamp', '$isoDate',
    '$randomInt', '$randomEmail', '$randomName',
    '$randomCPF', '$randomCNPJ', '$randomCelular'
  ]);

  function kindOf(key) {
    const k = String(key || '').trim();
    if (k.startsWith('vault.')) return 'vault';
    if (k.startsWith('$')) return 'dynamic';
    if (k.startsWith('@')) return 'chain';
    return 'var';
  }

  function findRefs(str) {
    const out = [];
    if (typeof str !== 'string' || !str.includes('{{')) return out;
    REF_RE.lastIndex = 0;
    let m;
    while ((m = REF_RE.exec(str)) !== null) {
      const key = String(m[1] || '').trim();
      out.push({ key, kind: kindOf(key), start: m.index, end: m.index + m[0].length, raw: m[0] });
    }
    return out;
  }

  // scopes: [{ name, vars: [{key,value,enabled,secret}], order }] — order crescente = menor precedência
  function resolveChain(key, scopes) {
    const k = String(key || '').trim();
    const chain = [];
    let winner = null;
    (scopes || []).forEach((scope) => {
      const list = Array.isArray(scope?.vars) ? scope.vars : [];
      const found = list.find((v) => v && v.enabled !== false && String(v.key || '').trim() === k);
      chain.push({
        scope: scope?.name || 'desconhecido',
        defined: Boolean(found),
        secret: Boolean(found?.secret),
        value: found ? (found.secret ? '••••' : (found.value ?? '')) : undefined
      });
      if (found) winner = { scope: scope.name, secret: Boolean(found.secret), value: found.value ?? '' };
    });
    return { value: winner ? winner.value : undefined, source: winner ? winner.scope : null, secret: winner ? winner.secret : false, chain, defined: winner !== null };
  }

  function collectStrings(requestLike) {
    const fields = [];
    const push = (field, value) => {
      if (typeof value === 'string' && value.includes('{{')) fields.push({ field, text: value });
    };
    const r = requestLike || {};
    push('url', r.url);
    (r.params || []).forEach((p, i) => { push(`params[${i}].key`, p?.key); push(`params[${i}].value`, p?.value); });
    (r.headers || []).forEach((h, i) => { push(`headers[${i}].key`, h?.key); push(`headers[${i}].value`, h?.value); });
    (r.body?.urlencoded || []).forEach((p, i) => { push(`body.urlencoded[${i}].key`, p?.key); push(`body.urlencoded[${i}].value`, p?.value); });
    (r.body?.formdata || []).forEach((p, i) => { push(`body.formdata[${i}].key`, p?.key); push(`body.formdata[${i}].value`, p?.value); });
    if (r.body?.mode === 'raw' || r.body?.mode === 'json') push('body.raw', r.body?.raw);
    if (r.body?.mode === 'graphql') { push('body.graphql.query', r.body?.graphql?.query); push('body.graphql.variables', r.body?.graphql?.variables); }
    return fields;
  }

  // isDefined(key) injetado pelo caller (mesma precedência do interpolateVariables)
  function findUnresolved(requestLike, isDefined) {
    const out = [];
    const seen = new Set();
    collectStrings(requestLike).forEach(({ field, text }) => {
      findRefs(text).forEach((ref) => {
        const id = `${field}:${ref.key}`;
        if (seen.has(id)) return;
        seen.add(id);
        let defined = false;
        try { defined = Boolean(isDefined?.(ref.key)); } catch { defined = false; }
        // vault.* é resolvido no main; não conta como não resolvida aqui
        if (ref.kind === 'vault') defined = true;
        if (!defined) out.push({ field, key: ref.key, kind: ref.kind });
      });
    });
    return out;
  }

  return { findRefs, resolveChain, findUnresolved, kindOf, DYNAMIC_KEYS };
});
