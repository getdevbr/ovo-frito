(function () {
  'use strict';

  function app() { return window.CDO?.app || null; }

  const selectedIds = new Set();
  let lastClickedId = null;
  let barEl = null;

  function ensureBar() {
    if (barEl) return barEl;
    const sidebar = document.getElementById('appSidebar');
    if (!sidebar) return null;
    barEl = document.createElement('div');
    barEl.id = 'sidebarBatchBar';
    barEl.className = 'hidden';
    barEl.style.cssText = 'display:flex;align-items:center;gap:4px;flex-wrap:wrap;padding:6px 8px;background:var(--bg-elevated,#252538);border-bottom:1px solid var(--border-color,#333);font-size:11px;';
    barEl.innerHTML = `
      <span id="sidebarBatchCount" style="font-weight:700;margin-right:auto;"></span>
      <button type="button" id="btnBatchMove" class="btn-small" title="Mover selecionadas para pasta">📁 Mover</button>
      <button type="button" id="btnBatchRun" class="btn-small" title="Executar selecionadas no Runner">▶ Rodar</button>
      <button type="button" id="btnBatchDelete" class="btn-small btn-danger-ghost" title="Excluir selecionadas">🗑</button>
      <button type="button" id="btnBatchClear" class="btn-small" title="Limpar seleção">✕</button>
    `;
    const listEl = document.getElementById('collectionsList');
    if (listEl && listEl.parentNode) {
      listEl.parentNode.insertBefore(barEl, listEl);
    }

    barEl.querySelector('#btnBatchClear')?.addEventListener('click', clearSelection);
    barEl.querySelector('#btnBatchRun')?.addEventListener('click', runSelected);
    barEl.querySelector('#btnBatchMove')?.addEventListener('click', moveSelected);
    barEl.querySelector('#btnBatchDelete')?.addEventListener('click', deleteSelected);
    return barEl;
  }

  function updateVisuals() {
    const listEl = document.getElementById('collectionsList');
    if (!listEl) return;
    listEl.querySelectorAll('[data-req-id]').forEach((el) => {
      const sel = selectedIds.has(el.dataset.reqId);
      el.classList.toggle('tree-item-selected', sel);
      el.style.outline = sel ? '1px solid var(--accent, #4f8cff)' : '';
      el.style.background = sel ? 'rgba(79, 140, 255, 0.14)' : '';
    });
    const bar = ensureBar();
    if (!bar) return;
    if (selectedIds.size === 0) {
      bar.classList.add('hidden');
      bar.style.display = 'none';
    } else {
      bar.classList.remove('hidden');
      bar.style.display = 'flex';
      const cnt = bar.querySelector('#sidebarBatchCount');
      if (cnt) cnt.textContent = `${selectedIds.size} selecionada(s)`;
    }
  }

  function clearSelection() {
    selectedIds.clear();
    lastClickedId = null;
    updateVisuals();
  }

  function findSelectedItems() {
    const a = app();
    const out = [];
    for (const col of a?.state?.collections || []) {
      for (const it of col.items || []) {
        if (selectedIds.has(it.id)) out.push({ col, item: it });
      }
    }
    return out;
  }

  function runSelected() {
    const a = app();
    const picked = findSelectedItems();
    if (!picked.length || !a?.runCollectionSequentially) return;
    a.runCollectionSequentially({
      id: picked[0].col.id,
      name: `Seleção (${picked.length} requests)`,
      auth: picked[0].col.auth,
      variables: picked[0].col.variables,
      items: picked.map((p) => p.item)
    });
  }

  async function moveSelected() {
    const a = app();
    const picked = findSelectedItems();
    if (!picked.length) return;
    const folder = window.prompt('Mover para qual pasta? (deixe vazio para raiz da Collection)', '');
    if (folder === null) return;
    const norm = window.CDO?.collectionTree?.normalizeFolderPath
      ? window.CDO.collectionTree.normalizeFolderPath(folder)
      : folder.trim();
    picked.forEach(({ col, item }) => {
      item.folder = norm;
      if (norm && window.CDO?.collectionTree?.createFolder) {
        window.CDO.collectionTree.createFolder(col, norm);
      }
    });
    await a.persistStore('collections');
    clearSelection();
    a.renderSidebar();
  }

  async function deleteSelected() {
    const a = app();
    const picked = findSelectedItems();
    if (!picked.length) return;
    const ok = await window.CDO?.dialog?.confirm?.({
      title: 'Excluir Requisições Selecionadas',
      message: `Excluir ${picked.length} requisição(ões) selecionada(s)?`,
      confirmLabel: 'Excluir',
      danger: true
    });
    if (!ok) return;
    for (const { col, item } of picked) {
      const idx = (col.items || []).indexOf(item);
      if (idx !== -1 && window.CDO?.trash?.remove) {
        await window.CDO.trash.remove({ type: 'request', item, origin: { collectionId: col.id, index: idx } });
      } else if (idx !== -1) {
        col.items.splice(idx, 1);
      }
    }
    await a.persistStore('collections');
    clearSelection();
    a.renderSidebar();
  }

  function attach() {
    const listEl = document.getElementById('collectionsList');
    if (!listEl || listEl.dataset.multiselectBound) return;
    listEl.dataset.multiselectBound = '1';
    listEl.addEventListener('click', (e) => {
      if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
        if (selectedIds.size > 0 && !e.target.closest('#sidebarBatchBar')) clearSelection();
        return;
      }
      const row = e.target.closest('[data-req-id]');
      if (!row) return;
      e.preventDefault();
      e.stopPropagation();
      const id = row.dataset.reqId;
      if (e.shiftKey && lastClickedId) {
        const allIds = Array.from(listEl.querySelectorAll('[data-req-id]')).map((el) => el.dataset.reqId);
        const i1 = allIds.indexOf(lastClickedId);
        const i2 = allIds.indexOf(id);
        if (i1 !== -1 && i2 !== -1) {
          const [from, to] = i1 <= i2 ? [i1, i2] : [i2, i1];
          for (let i = from; i <= to; i++) selectedIds.add(allIds[i]);
        }
      } else {
        if (selectedIds.has(id)) selectedIds.delete(id);
        else selectedIds.add(id);
        lastClickedId = id;
      }
      updateVisuals();
    }, true);
  }

  if (window.CDO?.hookBus) {
    window.CDO.hookBus.on('sidebar:rendered', updateVisuals);
    window.CDO.hookBus.on('app:ready', attach);
  } else {
    window.addEventListener('DOMContentLoaded', attach);
  }
})();
