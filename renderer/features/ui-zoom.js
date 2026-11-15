/* U-15: zoom da interface (Ctrl + / - / 0) persistido em settings.uiZoom. */
(function () {
  'use strict';

  const ZMIN = 0.5, ZMAX = 2.0, ZSTEP = 0.1;

  function currentZoom() {
    const z = parseFloat(window.CDO?.app?.state?.settings?.uiZoom);
    return Number.isFinite(z) && z > 0 ? z : 1;
  }

  function applyZoom(z) {
    const v = Math.min(ZMAX, Math.max(ZMIN, Math.round(z * 100) / 100));
    document.body.style.zoom = String(v);
    const pct = document.getElementById('zoomLevelBadge');
    if (pct) pct.textContent = `${Math.round(v * 100)}%`;
    return v;
  }

  async function setZoom(z) {
    const app = window.CDO?.app;
    if (!app?.state?.settings) return applyZoom(z);
    app.state.settings.uiZoom = applyZoom(z);
    if (typeof app.persistStore === 'function') await app.persistStore('settings');
    window.CDO?.toast?.show({ message: `Zoom: ${Math.round(app.state.settings.uiZoom * 100)}%`, durationMs: 1200 });
    return app.state.settings.uiZoom;
  }

  function init() {
    applyZoom(currentZoom());
    document.addEventListener('keydown', (e) => {
      if (!e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === '=' || e.key === '+') { e.preventDefault(); setZoom(currentZoom() + ZSTEP); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); setZoom(currentZoom() - ZSTEP); }
      else if (e.key === '0') { e.preventDefault(); setZoom(1); }
    });
    const reg = window.CDO?.commands;
    if (reg?.register) {
      ['in', 'out', 'reset'].forEach((dir) => {
        try {
          reg.register({
            id: `ui.zoom.${dir}`,
            title: dir === 'in' ? '🔍 Zoom In' : dir === 'out' ? '🔍 Zoom Out' : '🔍 Zoom 100%',
            category: 'Aparência',
            run: () => setZoom(dir === 'in' ? currentZoom() + ZSTEP : dir === 'out' ? currentZoom() - ZSTEP : 1)
          });
        } catch {}
      });
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  window.CDO = window.CDO || {};
  window.CDO.uiZoom = { applyZoom, setZoom, currentZoom };
})();
