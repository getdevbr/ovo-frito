'use strict';

function parseSetCookieHeader(rawCookieStr, defaultDomain) {
  const parts = String(rawCookieStr || '').split(';').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const firstEq = parts[0].indexOf('=');
  if (firstEq === -1) return null;
  const name = parts[0].slice(0, firstEq).trim();
  const value = parts[0].slice(firstEq + 1).trim();
  let domain = defaultDomain;
  let cookiePath = '/';
  let httpOnly = false;
  let secure = false;

  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    const eq = p.indexOf('=');
    const k = (eq !== -1 ? p.slice(0, eq) : p).trim().toLowerCase();
    const v = eq !== -1 ? p.slice(eq + 1).trim() : '';
    if (k === 'domain' && v) domain = v.replace(/^\./, '').toLowerCase();
    if (k === 'path' && v) cookiePath = v;
    if (k === 'httponly') httpOnly = true;
    if (k === 'secure') secure = true;
  }

  return {
    name,
    value,
    domain: domain.toLowerCase(),
    path: cookiePath,
    httpOnly,
    secure,
    updatedAt: new Date().toISOString()
  };
}

function createCookieJar(storage) {
  function updateFromResponse(hostname, setCookieHeaders) {
    if (!Array.isArray(setCookieHeaders) || setCookieHeaders.length === 0) return [];
    const jar = Array.isArray(storage.readStore('cookies')) ? storage.readStore('cookies') : [];
    const parsedList = [];

    for (const raw of setCookieHeaders) {
      const parsed = parseSetCookieHeader(raw, hostname);
      if (!parsed) continue;
      parsedList.push(parsed);
      const idx = jar.findIndex(
        (c) => c.domain === parsed.domain && c.name === parsed.name && c.path === parsed.path
      );
      if (idx !== -1) {
        jar[idx] = parsed;
      } else {
        jar.push(parsed);
      }
    }
    storage.writeStore('cookies', jar);
    return parsedList;
  }

  function getHeaderForHost(hostname) {
    const jar = Array.isArray(storage.readStore('cookies')) ? storage.readStore('cookies') : [];
    const host = String(hostname || '').toLowerCase();
    const matching = jar.filter(
      (c) => c && c.name && (host === c.domain || host.endsWith('.' + c.domain))
    );
    if (matching.length === 0) return '';
    return matching.map((c) => `${c.name}=${c.value}`).join('; ');
  }

  return {
    parseSetCookieHeader,
    updateFromResponse,
    getHeaderForHost
  };
}

module.exports = {
  createCookieJar,
  parseSetCookieHeader
};
