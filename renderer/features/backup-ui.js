(function () {
  'use strict';

  function app() { return window.CDO?.app || null; }

  async function handleExportBackup() {
    const a = app();
    if (!a?.IPC) return;
    const res = await a.IPC.invoke('pm:backup:export');
    if (!res?.ok || !res.backup) {
      window.CDO?.toast?.show?.({ message: res?.error?.message || 'Falha ao gerar backup.', type: 'error' });
      return;
    }
    const content = JSON.stringify(res.backup, null, 2);
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const dateSlug = new Date().toISOString().slice(0, 10);
    link.download = `ovo-frito-backup-${dateSlug}.ovo-backup`;
    link.click();
    URL.revokeObjectURL(link.href);
    window.CDO?.toast?.show?.({ message: `Backup exportado: ovo-frito-backup-${dateSlug}.ovo-backup`, type: 'success' });
  }

  async function handleRestoreFile(file) {
    const a = app();
    if (!file || !a?.IPC) return;
    const raw = await file.text();
    const preview = await a.IPC.invoke('pm:backup:preview', { raw });
    if (!preview?.ok) {
      window.CDO?.toast?.show?.({ message: preview?.error?.message || 'Backup inválido.', type: 'error' });
      return;
    }
    const ok = await window.CDO?.dialog?.confirm?.({
      title: 'Restaurar Backup do Workspace',
      message: `Restaurar ${preview.collectionsCount} Collection(s) e ${preview.profilesCount} Profile(s)${preview.hasVault ? ' + Cofre criptografado' : ''}?`,
      details: `Exportado em: ${preview.exportedAt || 'desconhecido'}\nModo: Mesclar (preserva itens locais com IDs diferentes).`,
      confirmLabel: 'Restaurar'
    });
    if (!ok) return;

    const restored = await a.IPC.invoke('pm:backup:restore', { raw, mode: 'merge', restoreVault: true });
    if (!restored?.ok) {
      window.CDO?.toast?.show?.({ message: restored?.error?.message || 'Falha ao restaurar backup.', type: 'error' });
      return;
    }
    const fresh = await a.IPC.invoke('pm:storage:loadAll');
    if (fresh.collections) a.state.collections = fresh.collections;
    if (fresh.profiles) a.state.profiles = fresh.profiles;
    if (fresh.settings) a.state.settings = fresh.settings;
    a.renderAll();
    window.CDO?.toast?.show?.({
      message: `Backup restaurado (${restored.collectionsCount} collections, ${restored.profilesCount} profiles)!`,
      type: 'success'
    });
  }

  function init() {
    const expBtn = document.getElementById('btnExportWorkspaceBackup');
    const resBtn = document.getElementById('btnRestoreWorkspaceBackup');
    const fileIn = document.getElementById('restoreBackupFileInput');
    if (expBtn && !expBtn.dataset.backupBound) {
      expBtn.dataset.backupBound = '1';
      expBtn.addEventListener('click', handleExportBackup);
    }
    if (resBtn && fileIn && !resBtn.dataset.backupBound) {
      resBtn.dataset.backupBound = '1';
      resBtn.addEventListener('click', () => fileIn.click());
      fileIn.addEventListener('change', async (e) => {
        const f = e.target.files?.[0];
        if (f) await handleRestoreFile(f);
        fileIn.value = '';
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
