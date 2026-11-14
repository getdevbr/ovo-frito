(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.schemaIr = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

  function detectStringFormat(str) {
    if (UUID_RE.test(str)) return 'uuid';
    if (ISO_DATE_RE.test(str)) return 'date-time';
    if (EMAIL_RE.test(str)) return 'email';
    return null;
  }

  function mergeNodes(nodes) {
    if (nodes.length === 0) return { kind: 'unknown' };
    if (nodes.length === 1) return nodes[0];

    const flat = [];
    for (const n of nodes) {
      if (n.kind === 'union') flat.push(...n.variants);
      else flat.push(n);
    }

    const byKind = new Map();
    for (const n of flat) {
      if (!byKind.has(n.kind)) byKind.set(n.kind, []);
      byKind.get(n.kind).push(n);
    }

    // integer + number -> number
    if (byKind.has('integer') && byKind.has('number')) {
      byKind.get('number').push(...byKind.get('integer'));
      byKind.delete('integer');
    }

    const mergedKinds = [];
    for (const [kind, group] of byKind.entries()) {
      if (kind === 'object') {
        const fieldMap = new Map();
        for (const obj of group) {
          for (const f of obj.fields) {
            if (!fieldMap.has(f.name)) {
              fieldMap.set(f.name, { nodes: [], count: 0, optional: false });
            }
            const entry = fieldMap.get(f.name);
            entry.nodes.push(f.node);
            entry.count += 1;
            if (f.optional) entry.optional = true;
          }
        }
        const fields = Array.from(fieldMap.entries()).map(([name, info]) => ({
          name,
          node: mergeNodes(info.nodes),
          optional: info.optional || info.count < group.length
        }));
        mergedKinds.push({ kind: 'object', fields });
      } else if (kind === 'array') {
        const itemNodes = group.map((a) => a.items).filter((i) => i.kind !== 'unknown');
        mergedKinds.push({ kind: 'array', items: mergeNodes(itemNodes) });
      } else {
        mergedKinds.push(group[0]);
      }
    }

    if (mergedKinds.length === 1) return mergedKinds[0];
    return { kind: 'union', variants: mergedKinds };
  }

  function inferIr(value, depth = 0, maxDepth = 20) {
    if (depth >= maxDepth) return { kind: 'unknown' };
    if (value === null) return { kind: 'null' };
    if (value === undefined) return { kind: 'unknown' };

    const t = typeof value;
    if (t === 'boolean') return { kind: 'boolean' };
    if (t === 'number') {
      return Number.isInteger(value) ? { kind: 'integer' } : { kind: 'number' };
    }
    if (t === 'string') {
      const fmt = detectStringFormat(value);
      return fmt ? { kind: 'string', formats: [fmt] } : { kind: 'string' };
    }
    if (Array.isArray(value)) {
      if (value.length === 0) return { kind: 'array', items: { kind: 'unknown' } };
      const itemNodes = value.map((v) => inferIr(v, depth + 1, maxDepth));
      return { kind: 'array', items: mergeNodes(itemNodes) };
    }
    if (t === 'object') {
      const fields = Object.keys(value).map((name) => ({
        name,
        node: inferIr(value[name], depth + 1, maxDepth),
        optional: false
      }));
      return { kind: 'object', fields };
    }
    return { kind: 'unknown' };
  }

  return {
    inferIr,
    mergeNodes
  };
});
