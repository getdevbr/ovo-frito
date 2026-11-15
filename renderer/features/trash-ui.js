(function () {
  'use strict';

  const tl = window.CDO?.trashLib;
  if (!tl) return;

  const app = () => window.CDO.app;
  const UNDO_MS = 10000;

  // snapshots completos só em memória durante a sessão
  const memoryItems = new Map();

  function state() { return app()?.state; }

  function diskEntries() {
    const s = state();
    if (!Array.isArray(s?.trash)) s.trash = [];
    return s.trash;
  }

  function persistTrash() {
    return Promise.resolve(app()?.persistStore?.('trash'));
  }

  async function remove({ type, item, origin = {}, confirm = null, undoMs = UNDO_MS } = {}) {
    const a = app();
    if (!a || !item) return { ok: false };

    // confirmação para Collection e Environment inteiros
    if ((type === 'collection' || type === 'environment') && typeof confirm === 'function') {
      const ok = await confirm({ type, item, count: type === 'collection' ? (item.items || []).length : (item.variables || []).length });
      if (!ok) return { ok: false, cancelled: true };
    }

    const entry = tl.createEntry({ type, item: JSON.parse(JSON.stringify(item)), origin });
    memoryItems.set(entry.id, entry.item);

    // remove do estado conforme o tipo
    if (type === 'request') {
      const col = a.state.collections.find((c) => c.id === origin.collectionId);
      const idx = col ? col.items.findIndex((it) => it.id === item.id) : -1;
      if (idx !== -1) col.items.splice(idx, 1);
    } else if (type === 'collection') {
      const idx = a.state.collections.findIndex((c) => c.id === item.id);
      if (idx !== -1) a.state.collections.splice(idx, 1);
    } else if (type === 'environment') {
      const idx = a.state.environments.findIndex((e) => e.id === item.id);
      if (idx !== -1) a.state.environments.splice(idx, 1);
    } else if (type === 'profile') {
      const env = a.state.environments.find((e) => e.id === origin.environmentId);
      const idx = env ? (env.customProfiles || []).findIndex((cp) => cp.id === item.id) : -1;
      if (idx !== -1) env.customProfiles.splice(idx, 1);
    } else {
      return { ok: false, reason: 'unsupported-type' };
    }

    // grava versão sanitizada em disco + entrada na lixeira
    const diskEntry = { ...entry, item: undefined, hasFullSnapshot: false };
    delete diskEntry.item;
    diskEntries().unshift(diskEntry);
    await persistTrash();

    const persistKey = type === 'environment' || type === 'profile' ? 'environments' : 'collections';
    await app()?.persistStore?.(persistKey);
    app()?.renderSidebar?.();
    app()?.renderAll?.();

    // toast com Desfazer
    const full = memoryItems.get(entry.id);
    window.CDO?.toast?.show?.({
      message: `${entry.name} excluído — está na lixeira por 30 dias`,
      type: 'info',
      durationMs: undoMs,
      action: {
        label: 'Desfazer',
        run: async () => {
          await restoreEntry(entry.id);
        }
      }
    });
    return { ok: true, entryId: entry.id, _full: full };
  }

  async function restoreEntry(entryId) {
    const a = app();
    const entries = diskEntries();
    const idx = entries.findIndex((e) => e.id === entryId);
    if (idx === -1) return { ok: false, reason: 'not-found' };
    const diskEntry = entries[idx];
    const full = memoryItems.get(entryId) || diskEntry.disk || diskEntry.item;
    const entry = { ...diskEntry, item: full };
    const res = tl.restore(a.state, entry);
    if (!res.ok) {
      window.CDO?.toast?.show?.({
        message: res.reason === 'collection-missing'
          ? 'Origem não existe mais — restaure a Collection primeiro.'
          : 'Não foi possível restaurar (origem ausente).',
        type: 'warning'
      });
      return res;
    }
    entries.splice(idx, 1);
    memoryItems.delete(entryId);
    await persistTrash();
    await app()?.persistStore?.(res.store);
    app()?.renderSidebar?.();
    app()?.renderAll?.();
    window.CDO?.toast?.show?.({ message: `${entry.name} restaurado`, type: 'success' });
    return { ok: true };
  }

  async function purgeEntry(entryId) {
    const entries = diskEntries();
    const idx = entries.findIndex((e) => e.id === entryId);
    if (idx === -1) return { ok: false };
    entries.splice(idx, 1);
    memoryItems.delete(entryId);
    await persistTrash();
    renderTrashPanel();
    return { ok: true };
  }

  function purgeExpired() {
    const s = state();
    if (!s) return;
    const before = diskEntries().length;
    s.trash = tl.purgeExpired(s.trash, Date.now(), 30);
    if (s.trash.length !== before) persistTrash();
    for (const id of [...memoryItems.keys()]) {
      if (!s.trash.some((e) => e.id === id)) memoryItems.delete(id);
    }
  }

  function hasSecretsNote() {
    // avisa se alguma entrada em disco não tem snapshot completo (restart)
    return diskEntries().some((e) => !e.hasFullSnapshot);
  }

  // ---------- Painel da Lixeira na sidebar ----------
  let panelRendered = false;
  function renderTrashPanel() {
    const container = document.getElementById('trashList');
    if (!container) return;
    container.innerHTML = '';
    const entries = diskEntries();
    if (entries.length === 0) {
      container.innerHTML = '<div class="empty-hint">Lixeira vazia. Itens excluídos ficam aqui por 30 dias.</div>';
      return;
    }
    if (hasSecretsNote()) {
      const note = document.createElement('div');
      note.className = 'empty-hint';
      note.textContent = '⚠ Itens restaurados após fechar o app perdem segredos (não ficam na lixeira em disco).';
      container.appendChild(note);
    }
    entries.forEach((e) => {
      const row = document.createElement('div');
      row.className = 'kv-row';
      row.style.gridTemplateColumns = '1fr auto auto';
      const label = document.createElement('span');
      label.style.fontSize = '12px';
      label.style.overflow = 'hidden';
      label.style.textOverflow = 'ellipsis';
      label.style.whiteSpace = 'nowrap';
      const when = new Date(e.deletedAt).toLocaleString();
      label.textContent = `${e.type}: ${e.name} — ${when}`;
      const restoreBtn = document.createElement('button');
      restoreBtn.className = 'btn-small';
      restoreBtn.textContent = 'Restaurar';
      restoreBtn.addEventListener('click', () => restoreEntry(e.id));
      const delBtn = document.createElement('button');
      delBtn.className = 'btn-small';
      delBtn.textContent = 'Excluir';
      delBtn.addEventListener('click', async () => {
        const ok = await window.CDO?.dialog?.confirm?.({
          title: 'Excluir definitivamente',
          message: `Remover "${e.name}" da lixeira para sempre?`,
          confirmLabel: 'Excluir',
          danger: true
        });
        if (ok) purgeEntry(e.id);
      });
      row.appendChild(label);
      row.appendChild(restoreBtn);
      row.appendChild(delBtn);
      container.appendChild(row);
    });
  }

  function init() {
    purgeExpired();
    const navBtn = document.querySelector('[data-sidebar-tab="trash"]');
    navBtn?.addEventListener('click', () => setTimeout(renderTrashPanel, 0));
    renderTrashPanel();
    panelRendered = true;
  }

  window.CDO = window.CDO || {};
  window.CDO.trash = { remove, restoreEntry, purgeEntry, purgeExpired, renderTrashPanel };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
