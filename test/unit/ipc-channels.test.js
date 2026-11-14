'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { INVOKE_CHANNELS, SEND_CHANNELS, SUBSCRIBE_CHANNELS } = require('../../main/ipc/channels');

const preloadSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'preload.js'), 'utf8');

function extractSet(name) {
  const m = preloadSrc.match(new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\)`));
  assert.ok(m, `preload.js deve declarar ${name}`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

test('preload allowlists match main/ipc/channels.js', () => {
  assert.deepEqual(extractSet('ALLOWED_INVOKE_CHANNELS').sort(), [...INVOKE_CHANNELS].sort());
  assert.deepEqual(extractSet('ALLOWED_SEND_CHANNELS').sort(), [...SEND_CHANNELS].sort());
  assert.deepEqual(extractSet('ALLOWED_SUBSCRIBE_CHANNELS').sort(), [...SUBSCRIBE_CHANNELS].sort());
});

test('every invoke channel has a handler registered in main/ipc', () => {
  const ipcDir = path.join(__dirname, '..', '..', 'main', 'ipc');
  const registered = new Set();
  for (const f of fs.readdirSync(ipcDir).filter((f) => f.endsWith('.js') && f !== 'index.js' && f !== 'channels.js')) {
    const src = fs.readFileSync(path.join(ipcDir, f), 'utf8');
    for (const m of src.matchAll(/ipcMain\.handle\('([^']+)'/g)) registered.add(m[1]);
  }
  for (const ch of INVOKE_CHANNELS) {
    assert.ok(registered.has(ch), `canal ${ch} na allowlist sem handler em main/ipc/`);
  }
});
