'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { escapeHtml } = require('../renderer/lib/escape');
const { interpolateString } = require('../renderer/lib/interpolate');
const { evaluateAssertions, resolveResponseSourceValue } = require('../renderer/lib/assertions');
const { toCsv, escapeCell } = require('../renderer/lib/csv');
const { createCookieJar } = require('../main/cookie-jar');
const { buildMultipartBuffer } = require('../main/http-engine');
const { createFolderSync, resolveSafePath } = require('../main/services/folder-sync');
const { createStorage } = require('../main/storage');
const { runUserScript } = require('../main/script-sandbox');

const XSS_PAYLOAD = '<img src=x onerror=alert(1)>';

describe('security-hardening: XSS escape', () => {
  it('escapes HTML metacharacters in the XSS payload', () => {
    const out = escapeHtml(XSS_PAYLOAD);
    assert.equal(out, '&lt;img src=x onerror=alert(1)&gt;');
    assert.ok(!out.includes('<img'));
    assert.ok(!out.includes('onerror=alert(1)>'));
  });

  it('escapes quotes, ampersands and single quotes', () => {
    assert.equal(escapeHtml(`"'&<>`), '&quot;&#39;&amp;&lt;&gt;');
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
    assert.equal(escapeHtml(42), '42');
  });
});

describe('security-hardening: prototype pollution', () => {
  it('blocks __proto__, constructor and prototype in interpolate keys', () => {
    const tpl = '{{__proto__}}|{{constructor}}|{{prototype}}|{{a.b}}';
    const variables = JSON.parse('{"__proto__":{"polluted":true},"a":{"b":"ok"}}');
    const out = interpolateString(tpl, { variables });
    assert.ok(out.includes('{{__proto__}}'));
    assert.ok(out.includes('{{constructor}}'));
    assert.ok(out.includes('{{prototype}}'));
    assert.ok(out.includes('ok'));
    assert.equal({}.polluted, undefined);
  });

  it('blocks unsafe path segments in nested getByPath lookups', () => {
    const vars = { nested: { value: 'safe' } };
    const out = interpolateString('{{nested.__proto__.x}}|{{nested.constructor}}', { variables: vars });
    assert.equal(out, '{{nested.__proto__.x}}|{{nested.constructor}}');
  });

  it('blocks unsafe segments in assertion json paths', () => {
    const parsed = { a: { b: 1 } };
    assert.equal(resolveResponseSourceValue({ status: 200 }, parsed, 'json.a.__proto__'), undefined);
    assert.equal(resolveResponseSourceValue({ status: 200 }, parsed, 'json.a.constructor'), undefined);
    assert.equal(resolveResponseSourceValue({ status: 200 }, parsed, 'json.a.prototype'), undefined);
    const results = evaluateAssertions(
      [{ source: 'json.a.__proto__.polluted', operator: '==', target: 'x', enabled: true }],
      { status: 200, headers: {} },
      parsed
    );
    assert.equal(results[0].passed, false);
  });
});

describe('security-hardening: CookieJar', () => {
  let dataDir;
  let storage;
  let jar;

  before(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdo-cookie-'));
    storage = createStorage({ dataDir });
    storage.ensurePortableDataDir();
    jar = createCookieJar(storage);
  });

  after(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('rejects cross-domain Cookie Tossing via Domain attribute', () => {
    const parsed = jar.parseSetCookieHeader('sess=abc; Domain=evil.com', 'app.example.com');
    assert.equal(parsed, null);
    const parsedSub = jar.parseSetCookieHeader('sess=abc; Domain=example.com', 'app.example.com');
    assert.ok(parsedSub);
    assert.equal(parsedSub.domain, 'example.com');
  });

  it('does not send Secure cookies over plain HTTP', () => {
    storage.writeStore('cookies', [
      { name: 'sec', value: '1', domain: 'example.com', path: '/', secure: true, httpOnly: false }
    ]);
    assert.equal(jar.getHeaderForHost('example.com', '/', false), '');
    assert.equal(jar.getHeaderForHost('example.com', '/', true), 'sec=1');
  });

  it('respects Expires and Max-Age', () => {
    const past = new Date(Date.now() - 10000).toUTCString();
    const deleted = jar.parseSetCookieHeader(`old=1; Expires=${past}`, 'example.com');
    assert.equal(deleted.deleted, true);
    const future = new Date(Date.now() + 60000).toUTCString();
    const kept = jar.parseSetCookieHeader(`keep=1; Expires=${future}`, 'example.com');
    assert.equal(kept.deleted, undefined);
    assert.ok(kept.expiresAt > Date.now());
    const maxAge = jar.parseSetCookieHeader('ma=1; Max-Age=60', 'example.com');
    assert.ok(maxAge.expiresAt > Date.now());
  });

  it('filters expired cookies when building Cookie header', () => {
    storage.writeStore('cookies', [
      { name: 'exp', value: 'x', domain: 'example.com', path: '/', expiresAt: Date.now() - 1 }
    ]);
    assert.equal(jar.getHeaderForHost('example.com', '/', true), '');
  });
});

describe('security-hardening: multipart CRLF', () => {
  it('strips CRLF and quotes from field names, filenames and content types', () => {
    const { buffer } = buildMultipartBuffer([
      { key: 'field\r\nX-Injected: 1', value: 'v', enabled: true },
      {
        key: 'file',
        type: 'file',
        fileBase64: Buffer.from('data').toString('base64'),
        fileName: 'a"\r\n.txt',
        fileContentType: 'text/plain\r\nX-Evil: y',
        enabled: true
      }
    ]);
    const text = buffer.toString('utf8');
    assert.ok(!text.includes('\r\nX-Injected'));
    assert.ok(!text.includes('\r\nX-Evil'));
    assert.ok(!text.includes('a"\r\n'));
    assert.ok(text.includes('field X-Injected: 1'));
    assert.ok(text.includes(`filename="a' .txt"`));
  });
});

describe('security-hardening: CSV formula injection', () => {
  function unescapeCsvCell(out) {
    if (out.startsWith('"') && out.endsWith('"')) {
      return out.slice(1, -1).replace(/""/g, '"');
    }
    return out;
  }

  it('neutralizes cells starting with formula characters', () => {
    for (const payload of ['=cmd|"/c calc"!A1', '+1+1', '-2+3', '@SUM(A1)', '\tTAB']) {
      const out = unescapeCsvCell(escapeCell(payload, ';'));
      assert.ok(out.startsWith("'"), `expected quote prefix for ${JSON.stringify(payload)} -> ${out}`);
    }
    assert.equal(escapeCell('safe', ';'), 'safe');
    const csv = toCsv(['a'], [['=HYPERLINK("http://evil")']], { bom: false });
    assert.ok(csv.includes("'=HYPERLINK"));
  });
});

describe('security-hardening: folder-sync', () => {
  let dataDir;
  let syncDir;
  let storage;
  let folderSync;

  before(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdo-sec-data-'));
    syncDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdo-sec-sync-'));
    storage = createStorage({ dataDir });
    storage.ensurePortableDataDir();
    folderSync = createFolderSync({ storage });
  });

  after(async () => {
    await folderSync.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(syncDir, { recursive: true, force: true });
  });

  it('resolveSafePath blocks traversal outside the sync root', () => {
    assert.throws(() => resolveSafePath(syncDir, '../escape.ovo'), /PATH_TRAVERSAL|fora da pasta/i);
    assert.throws(() => resolveSafePath(syncDir, 'sub/../../escape.ovo'), /PATH_TRAVERSAL|fora da pasta/i);
    assert.equal(resolveSafePath(syncDir, 'ok/file.ovo'), path.join(path.resolve(syncDir), 'ok', 'file.ovo'));
  });

  it('flushCollection sanitizes ../ folder segments', () => {
    storage.writeStore('collections', [
      {
        id: 'col_sec',
        name: 'Sec',
        items: [{ id: 'req_abcd', name: 'Evil', folder: '../../outside', method: 'GET', url: 'http://x' }]
      }
    ]);
    folderSync.flushCollection(storage.readStore('collections')[0], syncDir);
    assert.ok(!fs.existsSync(path.join(path.dirname(syncDir), 'outside')));
    assert.ok(fs.existsSync(path.join(syncDir, 'collection.ovo')));
  });

  it('rejects writes through symlinked directories', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'cdo-sec-out-'));
    const linkDir = path.join(syncDir, 'linkdir');
    try {
      fs.symlinkSync(outside, linkDir, 'dir');
    } catch {
      // Windows sem privilégio de symlink: pula
      fs.rmSync(outside, { recursive: true, force: true });
      return;
    }
    storage.writeStore('collections', [
      {
        id: 'col_link',
        name: 'Link',
        items: [{ id: 'req_ef01', name: 'ViaLink', folder: 'linkdir', method: 'GET', url: 'http://x' }]
      }
    ]);
    assert.throws(
      () => folderSync.flushCollection(storage.readStore('collections')[0], syncDir),
      /SYMLINK_REJECTED|Symlink/i
    );
    fs.rmSync(outside, { recursive: true, force: true });
  });
});

describe('security-hardening: pm script sandbox', () => {
  it('exposes no window or IPC globals inside user scripts', () => {
    const res = runUserScript({
      code: `pm.environment.set('w', typeof window); pm.environment.set('i', typeof IPC); pm.environment.set('p', typeof process); pm.environment.set('r', typeof require);`
    });
    assert.equal(res.ok, true);
    const env = Object.fromEntries(res.envSets.map((e) => [e.key, e.value]));
    assert.equal(env.w, 'undefined');
    assert.equal(env.i, 'undefined');
    assert.equal(env.p, 'undefined');
    assert.equal(env.r, 'undefined');
  });

  it('blocks dynamic code generation and process access', () => {
    const res = runUserScript({ code: `try { process.exit(1); } catch(e) {} pm.environment.set('alive', 'yes');` });
    assert.equal(res.ok, true);
    assert.ok(res.envSets.some((e) => e.key === 'alive'));
    const evil = runUserScript({ code: `const f = new Function('return process')();` });
    assert.equal(evil.ok, false);
  });
});
