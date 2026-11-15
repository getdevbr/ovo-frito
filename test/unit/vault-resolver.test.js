'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createVault } = require('../../main/vault');
const { collectVaultRefs, resolveVaultRefs, maskSecrets } = require('../../main/vault-resolver');

function unlockedVault() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdo-vaultres-'));
  const vault = createVault({ storage: { dataDir: dir } });
  vault.unlock('pw');
  return vault;
}

describe('vault-resolver', () => {
  it('collects refs from nested strings', () => {
    const refs = collectVaultRefs({
      url: 'https://x/{{vault.api_token}}',
      headers: [{ key: 'Authorization', value: 'Bearer {{ vault.secret_key }}' }],
      body: { mode: 'json', raw: '{"a":"{{vault.deep.key-1}}","b":"{{vault.a:b}}"}' },
      n: 42
    });
    assert.deepEqual(refs, ['a:b', 'api_token', 'deep.key-1', 'secret_key'].sort());
  });

  it('resolves refs recursively and collects secret values', () => {
    const vault = unlockedVault();
    vault.setSecret('api_token', 'tok-123');
    vault.setSecret('deep.key-1', 'v@l');
    const spec = {
      url: 'https://x/{{vault.api_token}}',
      headers: [{ key: 'Authorization', value: 'Bearer {{vault.api_token}}' }],
      body: { mode: 'raw', raw: 'k={{vault.deep.key-1}}' },
      network: { proxy: { password: '{{vault.deep.key-1}}' } }
    };
    const res = resolveVaultRefs(spec, vault);
    assert.equal(res.ok, true);
    assert.equal(res.spec.url, 'https://x/tok-123');
    assert.equal(res.spec.headers[0].value, 'Bearer tok-123');
    assert.equal(res.spec.body.raw, 'k=v@l');
    assert.equal(res.spec.network.proxy.password, 'v@l');
    assert.deepEqual([...res.secrets].sort(), ['tok-123', 'v@l']);
    // não muta o original
    assert.equal(spec.url, 'https://x/{{vault.api_token}}');
  });

  it('returns VAULT_LOCKED when vault is locked or missing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdo-vaultres-'));
    const locked = createVault({ storage: { dataDir: dir } });
    const spec = { url: 'https://x/{{vault.api_token}}' };
    for (const v of [locked, null, undefined]) {
      const res = resolveVaultRefs(spec, v);
      assert.equal(res.ok, false);
      assert.equal(res.error.code, 'VAULT_LOCKED');
      assert.deepEqual(res.error.keys, ['api_token']);
    }
  });

  it('returns VAULT_KEY_NOT_FOUND for missing keys', () => {
    const vault = unlockedVault();
    vault.setSecret('exists', 'yes');
    const res = resolveVaultRefs({ url: '{{vault.exists}}/{{vault.missing}}' }, vault);
    assert.equal(res.ok, false);
    assert.equal(res.error.code, 'VAULT_KEY_NOT_FOUND');
    assert.deepEqual(res.error.keys, ['missing']);
  });

  it('passes through specs without vault refs unchanged', () => {
    const res = resolveVaultRefs({ url: 'http://a/{{host}}', headers: [] }, unlockedVault());
    assert.equal(res.ok, true);
    assert.equal(res.spec.url, 'http://a/{{host}}');
    assert.equal(res.secrets.size, 0);
  });

  it('maskSecrets replaces secret values recursively', () => {
    const masked = maskSecrets(
      {
        requestSent: { url: 'https://x/?t=tok-123', headers: { Authorization: 'Bearer tok-123' }, body: 'k=v@l' },
        body: 'echo tok-123 and v@l',
        status: 200
      },
      new Set(['tok-123', 'v@l'])
    );
    const json = JSON.stringify(masked);
    assert.ok(!json.includes('tok-123'));
    assert.ok(!json.includes('v@l'));
    assert.ok(json.includes('••••'));
    assert.equal(masked.status, 200);
  });

  it('maskSecrets is a no-op for empty secrets', () => {
    const input = { a: 'secret-ish' };
    assert.equal(maskSecrets(input, new Set()), input);
    assert.equal(maskSecrets('x', null), 'x');
  });
});
