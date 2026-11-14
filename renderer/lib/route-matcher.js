(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.routeMatcher = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function extractPathname(rawUrl, variables = {}) {
    let url = String(rawUrl || '').trim();
    for (const [k, v] of Object.entries(variables)) {
      url = url.replace(new RegExp(`\\{\\{\\s*${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\}\\}`, 'g'), String(v));
    }
    url = url.replace(/^\{\{[^}]+\}\}/, '');
    url = url.replace(/^https?:\/\/[^/]+/i, '');
    const qIdx = url.indexOf('?');
    if (qIdx !== -1) url = url.slice(0, qIdx);
    if (!url.startsWith('/')) url = `/${url}`;
    if (url.length > 1 && url.endsWith('/')) url = url.slice(0, -1);
    return url;
  }

  function compileRoute(item, variables = {}) {
    const pathname = extractPathname(item.url, variables);
    const segments = pathname === '/' ? [] : pathname.slice(1).split('/');
    let score = 0;
    const compiledSegments = segments.map((seg) => {
      if (seg === '*') {
        score += 1;
        return { kind: 'wildcard' };
      }
      if (seg.startsWith(':') || (seg.startsWith('{') && seg.endsWith('}')) || (seg.startsWith('{{') && seg.endsWith('}}'))) {
        score += 2;
        const paramName = seg.replace(/^[:{]+|[}]+$/g, '');
        return { kind: 'param', name: paramName };
      }
      score += 3;
      return { kind: 'literal', value: seg };
    });

    return {
      method: String(item.method || 'GET').toUpperCase(),
      pathname,
      segments: compiledSegments,
      score,
      item
    };
  }

  function compileRoutes(items, variables = {}) {
    return (items || [])
      .map((item, idx) => ({ ...compileRoute(item, variables), order: idx }))
      .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.order - b.order));
  }

  function matchRoute(compiledRoutes, method, reqPath) {
    const cleanMethod = String(method || 'GET').toUpperCase();
    const pathname = extractPathname(reqPath);
    const reqSegs = pathname === '/' ? [] : pathname.slice(1).split('/');

    for (const route of compiledRoutes) {
      if (route.method !== cleanMethod) continue;
      const rSegs = route.segments;
      const hasWildcard = rSegs.some((s) => s.kind === 'wildcard');
      if (!hasWildcard && rSegs.length !== reqSegs.length) continue;

      const params = {};
      let matched = true;
      for (let i = 0; i < rSegs.length; i++) {
        const rs = rSegs[i];
        if (rs.kind === 'wildcard') {
          matched = true;
          break;
        }
        if (i >= reqSegs.length) {
          matched = false;
          break;
        }
        if (rs.kind === 'literal' && rs.value !== reqSegs[i]) {
          matched = false;
          break;
        }
        if (rs.kind === 'param') {
          params[rs.name] = decodeURIComponent(reqSegs[i]);
        }
      }

      if (matched) {
        return { route, params };
      }
    }
    return null;
  }

  return {
    extractPathname,
    compileRoutes,
    matchRoute
  };
});
