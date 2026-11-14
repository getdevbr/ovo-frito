'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createVault, encryptSecret, decryptSecret } = require('../../main/vault');

describe('vault', () => {
  it('encrypts and decrypts AES-256-GCM payloads', () => {
    const payload = encryptSecret('s3cret', 'token-value');
    assert.match(payload, /^cdo1\./);
    assert.equal(decryptSecret('s3cret', payload), 'token-value');
    assert.throws(() => decryptSecret('wrong', payload));
  });

  it('persists secrets encrypted and requires unlock', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdo-vault-'));
    const storage = { dataDir: dir };
    const vault = createVault({ storage });
    assert.equal(vault.status().unlocked, false);
    assert.equal(vault.setSecret('api_key', 'abc').ok, false);
    assert.equal(vault.unlock('pass').ok, true);
    assert.equal(vault.setSecret('api_key', 'abc').ok, true);
    vault.lock();
    const vault2 = createVault({ storage });
    assert.equal(vault2.unlock('pass').ok, true);
    assert.equal(vault2.getSecret('api_key').value, 'abc');
    assert.equal(vault2.unlock('bad').ok, false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
