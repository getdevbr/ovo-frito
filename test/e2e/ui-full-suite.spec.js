'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('ui-full-suite: menus, toolbox, sidebar, editor, response e config', async () => {
  test.setTimeout(180000);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdo-e2e-ui-'));

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/items') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{ id: 1, name: 'alpha' }, { id: 2, name: 'beta' }]));
      return;
    }
    if (url.pathname === '/echo' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          method: req.method,
          path: url.pathname,
          headers: req.headers,
          body: body ? JSON.parse(body) : null
        }));
      });
      return;
    }
    if (url.pathname === '/slow') {
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ slow: true }));
      }, 400);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const electronEnv = { ...process.env, CDO_DATA_DIR: tmpDir };
  delete electronEnv.ELECTRON_RUN_AS_NODE;
  const electronApp = await electron.launch({
    args: [path.join(__dirname, '..', '..')],
    env: electronEnv
  });

  const isVisible = async (locator) => {
    try {
      await expect(locator).toBeVisible({ timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  };

  try {
    const page = await electronApp.firstWindow();
    await page.waitForSelector('#reqUrl');
    await page.waitForFunction(() => window.CDO?.app?.state, null, { timeout: 15000 });
    // Garante que features injetaram botões nos slots
    await page.waitForSelector('#btnOpenApiDocsModal', { state: 'attached', timeout: 10000 });
    await page.waitForSelector('#btnOpenTypeGenModal', { state: 'attached', timeout: 10000 });
    await page.waitForSelector('#btnViewTable', { state: 'attached', timeout: 10000 });
    await page.waitForSelector('#btnGenerateContract', { state: 'attached', timeout: 10000 });

    // ===== 1. Menu Workspace =====
    await page.click('#btnMenuWorkspace');
    expect(await isVisible(page.locator('#workspaceMenuSlot'))).toBeTruthy();

    await page.click('#btnOpenImportModal');
    await expect(page.locator('#importModal')).toBeVisible();
    await page.click('#btnCloseImportModal');
    await expect(page.locator('#importModal')).toBeHidden();

    await page.click('#btnMenuWorkspace');
    await page.click('#btnOpenSyncModal');
    await expect(page.locator('#folderSyncModal')).toBeVisible();
    await page.click('#btnCloseSyncModal');
    await expect(page.locator('#folderSyncModal')).toBeHidden();

    await page.click('#btnMenuWorkspace');
    await page.click('#btnOpenApiDocsModal');
    await expect(page.locator('#apiDocsModal')).toBeVisible();
    await page.click('#btnCloseApiDocsModal');
    await expect(page.locator('#apiDocsModal')).toBeHidden();

    // ===== 2. Menu Tools =====
    const toolsCases = [
      ['#btnOpenDevToolboxModal', '#devToolboxModal', '#btnCloseDevToolboxModal'],
      ['#btnOpenVaultModal', '#vaultModal', '#btnCloseVaultModal'],
      ['#btnOpenMockModal', '#mockServerModal', '#btnCloseMockModal'],
      ['#btnOpenCaptureModal', '#captureModal', '#btnCloseCaptureModal'],
      ['#btnOpenWsModal', '#wsModal', '#btnCloseWsModal'],
      ['#btnOpenSseModal', '#sseModal', '#btnCloseSseModal']
    ];
    for (const [openId, modalId, closeId] of toolsCases) {
      await page.click('#btnMenuTools');
      await expect(page.locator('#toolsMenuSlot')).toBeVisible();
      await page.click(openId);
      await expect(page.locator(modalId)).toBeVisible();
      await page.click(closeId);
      await expect(page.locator(modalId)).toBeHidden();
    }

    // ===== 3. Dev Toolbox =====
    await page.click('#btnMenuTools');
    await page.click('#btnOpenDevToolboxModal');
    await expect(page.locator('#devToolboxModal')).toBeVisible();
    await page.fill('#toolboxInputText', 'hello');
    await page.click('[data-toolbox-op="b64-encode"]');
    await expect(page.locator('#toolboxOutputText')).toHaveValue('aGVsbG8=');
    await page.click('[data-toolbox-gen="cpf"]');
    await expect(page.locator('#toolboxOutputText')).toHaveValue(/^\d{11}$/);
    await page.click('#btnCloseDevToolboxModal');

    // ===== 4. Command Palette =====
    await page.click('#btnOpenCommandPalette');
    await expect(page.locator('#commandPaletteModal')).toBeVisible();
    await page.click('#btnCloseCommandPalette');
    await expect(page.locator('#commandPaletteModal')).toBeHidden();

    // ===== 5. Manual =====
    await page.click('#btnOpenManualModal');
    await expect(page.locator('#manualModal')).toBeVisible();
    await page.click('#btnCloseManualModal');
    await expect(page.locator('#manualModal')).toBeHidden();

    // ===== 6. Sidebar =====
    await page.click('[data-sidebar-tab="profiles"]');
    await page.click('[data-sidebar-tab="collections"]');
    await page.click('#btnNewCollection');
    await page.fill('#sidebarSearchInput', 'Collection');
    await page.dblclick('#sidebarResizer');
    await expect(page.locator('#appSidebar')).toHaveClass(/collapsed/);
    await page.dblclick('#sidebarResizer');
    await expect(page.locator('#appSidebar')).not.toHaveClass(/collapsed/);
    await page.fill('#sidebarSearchInput', '');

    // ===== 6b. Pastas na Collection (Criar, Renomear, Excluir) =====
    await page.click('.btn-add-folder-inline >> nth=0');
    await expect(page.locator('.folder-row .inline-rename-input')).toBeVisible();
    await page.fill('.folder-row .inline-rename-input', 'Autenticacao');
    await page.press('.folder-row .inline-rename-input', 'Enter');
    await expect(page.locator('.folder-row[data-folder-path="Autenticacao"]')).toBeVisible();

    await page.click('.folder-row[data-folder-path="Autenticacao"] [aria-label="Renomear pasta Autenticacao"]');
    await expect(page.locator('.folder-row .inline-rename-input')).toBeVisible();
    await page.fill('.folder-row .inline-rename-input', 'Seguranca');
    await page.press('.folder-row .inline-rename-input', 'Enter');
    await expect(page.locator('.folder-row[data-folder-path="Seguranca"]')).toBeVisible();

    await page.click('.folder-row[data-folder-path="Seguranca"] [aria-label="Excluir pasta Seguranca"]');
    await expect(page.locator('.folder-row[data-folder-path="Seguranca"]')).toHaveCount(0);

    // ===== 7. Request editor + envio =====
    await page.click('#btnNewTab');
    await page.fill('#reqNameInput', 'E2E Echo');
    await page.selectOption('#reqMethod', 'POST');
    await page.fill('#reqUrl', `${base}/echo`);

    // Params tab
    await page.click('[data-req-tab="params"]');
    await page.click('#btnAddParam');
    await page.click('#btnBulkEditParams');
    await page.click('#btnBulkEditParams');

    // Auth tab
    await page.click('[data-req-tab="auth"]');
    await page.selectOption('#authType', 'bearer');
    await page.fill('#authBearerToken', 'e2e-token-123');

    // Headers tab
    await page.click('[data-req-tab="headers"]');
    await page.click('#btnAddHeader');

    // Body tab: JSON
    await page.click('[data-req-tab="body"]');
    await page.check('input[name="bodyMode"][value="json"]');
    await page.fill('#bodyRawInput', '{"ping":"e2e","n":1}');
    await page.click('#btnBeautifyJson');

    // Tests & Captura: assertion
    await page.click('[data-req-tab="tests"]');
    await page.click('#btnAddAssertion');

    // Send
    await page.click('#btnSend');
    await expect(page.locator('#responseMeta')).toContainText('200', { timeout: 15000 });
    await expect(page.locator('[data-waterfall]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#responseBodyPre')).toContainText('e2e-token-123');

    // View controls
    await page.click('#btnViewPretty');
    await page.click('#btnViewRaw');
    await page.click('#btnViewTable');
    await page.click('#btnViewPretty');

    // Response tabs
    for (const tab of ['headers', 'cookies', 'tests', 'inspector', 'history']) {
      await page.click(`[data-res-tab="${tab}"]`);
    }
    await page.click('[data-res-tab="body"]');

    // ===== 8. Request advanced menu =====
    await page.click('#btnMenuReqMore');
    await expect(page.locator('#reqMoreMenuSlot')).toBeVisible();
    await page.click('#btnOpenCompareProfileModal');
    await expect(page.locator('#compareProfileModal')).toBeVisible();
    await page.click('#btnCloseCompareProfileModal');
    await page.click('#btnMenuReqMore');
    await page.click('#btnOpenLoadTestModal');
    await expect(page.locator('#loadTestModal')).toBeVisible();
    await page.click('#btnCloseLoadTestModal');
    await page.click('#btnMenuReqMore');
    await page.click('#btnOpenGqlModal');
    await expect(page.locator('#gqlModal')).toBeVisible();
    await page.click('#btnCloseGqlModal');

    // ===== 9. Code modal =====
    await page.click('#btnOpenCodeModal');
    await expect(page.locator('#codeModal')).toBeVisible();
    for (const lang of ['ovo', 'bru', 'curl']) {
      await page.selectOption('#codegenLangSelect', lang);
      await expect(page.locator('#codegenOutputPre')).not.toBeEmpty();
    }
    await page.click('#btnCloseCodeModal');

    // ===== 10. Response generate menu =====
    await page.click('#btnMenuResGenerate');
    await expect(page.locator('#resGenerateMenuSlot')).toBeVisible();
    await page.click('#btnOpenTypeGenModal');
    await expect(page.locator('#typeGenModal')).toBeVisible();
    await expect(page.locator('#typeGenOutputPre')).not.toBeEmpty({ timeout: 5000 });
    await page.click('#btnCloseTypeGenModal');
    await page.click('#btnMenuResGenerate');
    await page.click('#btnGenerateContract');

    // ===== 11. Config / tema / layout =====
    await page.click('#btnOpenNetworkModal');
    await expect(page.locator('#networkModal')).toBeVisible();
    const themeBefore = await page.getAttribute('html', 'data-theme');
    await page.click('#btnToggleTheme');
    const themeAfter = await page.getAttribute('html', 'data-theme');
    expect(themeAfter).not.toBe(themeBefore);
    await page.click('[data-disp-split="horizontal"]');
    await page.click('[data-disp-split="vertical"]');
    await page.click('[data-disp-focus="equal"]');
    await page.click('#btnCloseNetworkModal');
    await expect(page.locator('#networkModal')).toBeHidden();
  } finally {
    await electronApp.close();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
