'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('smoke: launches Electron, sends GET to local server, sees 200', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdo-e2e-'));
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, from: 'smoke-server' }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  const electronApp = await electron.launch({
    args: [path.join(__dirname, '..', '..')],
    env: {
      ...process.env,
      CDO_DATA_DIR: tmpDir
    }
  });

  try {
    const page = await electronApp.firstWindow();
    await page.waitForSelector('#reqUrl');

    await page.fill('#reqUrl', `http://127.0.0.1:${port}/ping`);
    await page.click('#btnSend');

    await expect(page.locator('#responseMeta')).toContainText('200', { timeout: 10000 });
    await expect(page.locator('#responseBodyPre')).toContainText('smoke-server');
  } finally {
    await electronApp.close();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
