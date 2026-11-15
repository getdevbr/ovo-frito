(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.sessionSerializer = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SENSITIVE_HEADERS = new Set(['authorization', 'proxy-authorization', 'cookie', 'set-cookie', 'x-api-key']);
  const SECRET_AUTH_FIELDS = ['token', 'password', 'clientSecret', 'keyValue', 'secret', 'accessToken', 'refreshToken', 'apiKey'];
  const DEFAULT_MAX_BODY = 1024 * 1024; // 1 MB

  function scrubAuth(auth) {
    if (!auth || typeof auth !== 'object') return auth;
    const out = { ...auth };
    for (const f of SECRET_AUTH_FIELDS) {
      if (f in out) out[f] = '';
    }
    return out;
  }

  function scrubHeaders(headers) {
    if (!Array.isArray(headers)) return headers;
    return headers.map((h) => (
      h && SENSITIVE_HEADERS.has(String(h.key || '').toLowerCase()) ? { ...h, value: '' } : h
    ));
  }

  function scrubResponse(response, maxBodyBytes, stats) {
    if (!response || typeof response !== 'object') return response;
    const out = { ...response };
    if (out.requestSent && typeof out.requestSent === 'object') {
      out.requestSent = { ...out.requestSent };
      if (out.requestSent.resolvedAuth) {
        out.requestSent.resolvedAuth = scrubAuth(out.requestSent.resolvedAuth);
        stats.droppedSecrets++;
      }
      if (Array.isArray(out.requestSent.headers)) {
        out.requestSent.headers = scrubHeaders(out.requestSent.headers);
      }
    }
    const body = out.body;
    if (typeof body === 'string' && body.length > maxBodyBytes) {
      out.body = '';
      out.bodyTruncated = true;
      out.bodyMeta = {
        sizeBytes: body.length,
        status: out.status,
        timeMs: out.timeMs,
        contentType: out.contentType
      };
      stats.droppedBodies++;
    }
    return out;
  }

  function serializeTab(tab, maxBodyBytes, stats) {
    if (!tab || typeof tab !== 'object') return tab;
    const out = { ...tab };
    out.auth = scrubAuth(out.auth);
    if (out.auth && SECRET_AUTH_FIELDS.some((f) => f in (tab.auth || {}))) stats.droppedSecrets++;
    out.headers = scrubHeaders(out.headers);
    out.params = Array.isArray(out.params) ? out.params.map((p) => ({ ...p })) : out.params;
    if (out.response) out.response = scrubResponse(out.response, maxBodyBytes, stats);
    if (Array.isArray(out.history)) {
      out.history = out.history.map((h) => {
        if (!h || typeof h !== 'object') return h;
        const hh = { ...h };
        hh.auth = scrubAuth(hh.auth);
        hh.headers = scrubHeaders(hh.headers);
        if (hh.response) hh.response = scrubResponse(hh.response, maxBodyBytes, stats);
        if (hh.requestSent) hh.requestSent = { ...hh.requestSent, resolvedAuth: scrubAuth(hh.requestSent.resolvedAuth) };
        return hh;
      });
    }
    return out;
  }

  /**
   * sessions: objeto no formato de state.sessions ({ tabs, activeTabId, responseCache, ui? })
   * Retorna { data, droppedSecrets, droppedBodies } — data é segura para disco.
   */
  function serializeSession(sessions, { maxBodyBytes = DEFAULT_MAX_BODY } = {}) {
    const src = sessions || {};
    const stats = { droppedSecrets: 0, droppedBodies: 0 };
    const tabs = (Array.isArray(src.tabs) ? src.tabs : []).map((t) => serializeTab(t, maxBodyBytes, stats));
    const data = {
      tabs,
      activeTabId: src.activeTabId || null,
      responseCache: {}, // cache de respostas nunca vai para disco
      cleanShutdown: src.cleanShutdown !== false,
      ui: src.ui && typeof src.ui === 'object' ? { ...src.ui } : undefined
    };
    return { data, droppedSecrets: stats.droppedSecrets, droppedBodies: stats.droppedBodies };
  }

  return { serializeSession, scrubAuth, scrubHeaders, SENSITIVE_HEADERS, SECRET_AUTH_FIELDS };
});
