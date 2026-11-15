(function () {
  'use strict';

  const rc = window.CDO?.recents;
  if (!rc) return;

  const app = () => window.CDO.app;

  function settings() {
    const a = app();
    if (!a?.state.settings) return null;
    if (!Array.isArray(a.state.settings.favorites)) a.state.settings.favorites = [];
    if (!Array.isArray(a.state.settings.recents)) a.state.settings.recents = [];
    return a.state.settings;
  }

  async function persist() {
    await app()?.persistStore?.('settings');
  }

  function isFavorite(id) {
    return Boolean(settings()?.favorites?.includes(id));
  }

  async function toggleFavorite(id) {
    const s = settings();
    if (!s || !id) return false;
    s.favorites = rc.toggle(s.favorites, id);
    await persist();
    app()?.renderSidebar?.();
    return s.favorites.includes(id);
  }

  // chamado ao abrir uma request
  async function touchRecent(id) {
    const s = settings();
    if (!s || !id) return;
    s.recents = rc.touch(s.recents, id, 10);
    await persist();
  }

  // remove ids órfãos (requests excluídas/renomeadas não afetam ids)
  function pruneOrphans() {
    const s = settings();
    if (!s) return;
    const ids = new Set();
    (app()?.state.collections || []).forEach((c) => (c.items || []).forEach((it) => it.id && ids.add(it.id)));
    s.favorites = rc.prune(s.favorites, ids);
    s.recents = rc.prune(s.recents, ids);
  }

  function findRequest(id) {
    for (const col of app()?.state.collections || []) {
      const it = (col.items || []).find((x) => x.id === id);
      if (it) return { item: it, collectionId: col.id };
    }
    return null;
  }

  window.CDO = window.CDO || {};
  window.CDO.favorites = { isFavorite, toggleFavorite, touchRecent, pruneOrphans, findRequest };
})();
