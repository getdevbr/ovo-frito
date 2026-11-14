'use strict';

function domainMatches(host, domain) {
  const h = String(host || '').toLowerCase().replace(/^\./, '');
  const d = String(domain || '').toLowerCase().replace(/^\./, '');
  if (!h || !d) return false;
  return h === d || h.endsWith('.' + d);
}

function pathMatches(requestPath, cookiePath) {
  const req = String(requestPath || '/');
  const cp = String(cookiePath || '/');
  if (cp === '/') return true;
  return req === cp || req.startsWith(cp.endsWith('/') ? cp : cp + '/');
}

function parseExpiresMs(parts) {
  for (const p of parts) {
    const eq = p.indexOf('=');
    const k = (eq !== -1 ? p.slice(0, eq) : p).trim().toLowerCase();
    const v = eq !== -1 ? p.slice(eq + 1).trim() : '';
    if (k === 'max-age' && v !== '' && Number.isFinite(Number(v))) {
      return { expiresAt: Date.now() + Number(v) * 1000 };
    }
    if (k === 'expires' && v) {
      const t = Date.parse(v);
      if (!Number.isNaN(t)) return { expiresAt: t };
    }
  }
  return { expiresAt: null };
}

function parseSetCookieHeader(rawCookieStr, defaultDomain) {
  const parts = String(rawCookieStr || '').split(';').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const firstEq = parts[0].indexOf('=');
  if (firstEq === -1) return null;
  const name = parts[0].slice(0, firstEq).trim();
  const value = parts[0].slice(firstEq + 1).trim();
  const defaultHost = String(defaultDomain || '').toLowerCase().replace(/^\./, '');
  let domain = defaultHost;
  let cookiePath = '/';
  let httpOnly = false;
  let secure = false;
  let domainAttr = null;

  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    const eq = p.indexOf('=');
    const k = (eq !== -1 ? p.slice(0, eq) : p).trim().toLowerCase();
    const v = eq !== -1 ? p.slice(eq + 1).trim() : '';
    if (k === 'domain' && v) {
      domainAttr = v.replace(/^\./, '').toLowerCase();
      domain = domainAttr;
    }
    if (k === 'path' && v) cookiePath = v;
    if (k === 'httponly') httpOnly = true;
    if (k === 'secure') secure = true;
  }

  // Anti Cookie Tossing: o atributo Domain precisa fazer domain-match com o host
  // que emitiu o Set-Cookie (RFC 6265 §5.3).
  if (domainAttr && !domainMatches(defaultHost, domainAttr)) {
    return null;
  }

  const { expiresAt } = parseExpiresMs(parts);
  if (expiresAt !== null && expiresAt <= Date.now()) {
    return { name, value: '', domain: domain.toLowerCase(), path: cookiePath, httpOnly, secure, expiresAt, deleted: true };
  }

  return {
    name,
    value,
    domain: domain.toLowerCase(),
    path: cookiePath,
    httpOnly,
    secure,
    expiresAt,
    updatedAt: new Date().toISOString()
  };
}

function createCookieJar(storage) {
  function readJar() {
    return Array.isArray(storage.readStore('cookies')) ? storage.readStore('cookies') : [];
  }

  function updateFromResponse(hostname, setCookieHeaders) {
    if (!Array.isArray(setCookieHeaders) || setCookieHeaders.length === 0) return [];
    const jar = readJar();
    const parsedList = [];

    for (const raw of setCookieHeaders) {
      const parsed = parseSetCookieHeader(raw, hostname);
      if (!parsed) continue;
      parsedList.push(parsed);
      const idx = jar.findIndex(
        (c) => c.domain === parsed.domain && c.name === parsed.name && c.path === parsed.path
      );
      if (parsed.deleted) {
        if (idx !== -1) jar.splice(idx, 1);
        continue;
      }
      if (idx !== -1) {
        jar[idx] = parsed;
      } else {
        jar.push(parsed);
      }
    }
    storage.writeStore('cookies', jar);
    return parsedList.filter((c) => !c.deleted);
  }

  function getHeaderForHost(hostname, pathname = '/', isHttps = true) {
    const jar = readJar();
    const host = String(hostname || '').toLowerCase();
    const now = Date.now();
    const matching = jar.filter(
      (c) =>
        c &&
        c.name &&
        !(c.expiresAt && c.expiresAt <= now) &&
        (!c.secure || isHttps) &&
        pathMatches(pathname, c.path) &&
        domainMatches(host, c.domain)
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
