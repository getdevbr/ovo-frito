(function () {
  'use strict';

  function initSidebarDnd() {
    const listEl = document.getElementById('collectionsList');
    if (!listEl) return;

    function attachDnd() {
      const items = listEl.querySelectorAll('[data-req-id]');
      items.forEach((el) => {
        el.setAttribute('draggable', 'true');
        el.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', el.dataset.reqId || '');
        });
      });

      const cols = listEl.querySelectorAll('[data-col-id]');
      cols.forEach((colEl) => {
        colEl.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.stopPropagation();
        });
        colEl.addEventListener('drop', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const itemId = e.dataTransfer.getData('text/plain');
          const toColId = colEl.dataset.colId;
          if (!itemId || !toColId || !window.CDO?.app?.state?.collections) return;
          const ok = window.CDO.collectionTree.moveItem(window.CDO.app.state.collections, {
            itemId,
            toCollectionId: toColId,
            toFolder: colEl.dataset.folderPath || ''
          });
          if (ok) {
            await window.CDO.app.persistStore('collections');
            window.CDO.app.renderSidebar();
          }
        });
      });
    }

    if (window.CDO?.hookBus) {
      window.CDO.hookBus.on('sidebar:rendered', attachDnd);
    }
    attachDnd();
  }

  if (window.CDO?.hookBus) {
    window.CDO.hookBus.on('app:ready', initSidebarDnd);
  } else {
    window.addEventListener('DOMContentLoaded', initSidebarDnd);
  }
})();
