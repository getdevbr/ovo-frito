'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('criar pasta e subpasta na sidebar atualiza o visual imediatamente sem clicar fora', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdo-e2e-folder-'));
  const electronEnv = { ...process.env, CDO_DATA_DIR: tmpDir };
  delete electronEnv.ELECTRON_RUN_AS_NODE;
  const electronApp = await electron.launch({
    args: [path.join(__dirname, '..', '..')],
    env: electronEnv
  });

  try {
    const page = await electronApp.firstWindow();
    await page.waitForFunction(() => window.CDO?.app?.state?.collections?.length > 0, null, { timeout: 15000 });

    const moreBtn = page.locator('.collection-header button[title^="Mais ações"]').first();
    await moreBtn.click();
    await page.getByRole('button', { name: 'Nova Pasta' }).click();

    const folderRow = page.locator('.folder-row[data-folder-path="Nova Pasta"]');
    await expect(folderRow).toBeVisible({ timeout: 2000 });

    const renameInput = folderRow.locator('input.inline-rename-input');
    await expect(renameInput).toBeVisible();
    await expect(renameInput).toBeFocused();

    await renameInput.fill('MinhaPastaTeste');
    await renameInput.press('Enter');

    const renamedRow = page.locator('.folder-row[data-folder-path="MinhaPastaTeste"]');
    await expect(renamedRow).toBeVisible({ timeout: 2000 });
    await expect(renamedRow).toContainText('MinhaPastaTeste');

    // Testa também criação de subpasta via botão 📁+ na pasta recém-criada
    await renamedRow.hover();
    await renamedRow.locator('button[aria-label^="Criar subpasta"]').click();

    const subRow = page.locator('.folder-row[data-folder-path="MinhaPastaTeste/Nova Pasta"]');
    await expect(subRow).toBeVisible({ timeout: 2000 });
    const subInput = subRow.locator('input.inline-rename-input');
    await expect(subInput).toBeVisible();
    await expect(subInput).toBeFocused();
    await subInput.fill('MinhaPastaTeste/SubTeste');
    await subInput.press('Enter');

    await expect(page.locator('.folder-row[data-folder-path="MinhaPastaTeste/SubTeste"]')).toBeVisible({ timeout: 2000 });
  } finally {
    await electronApp.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
