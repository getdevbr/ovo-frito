(function () {
  'use strict';

  let zenActive = false;

  function ensureStyles() {
    if (document.getElementById('zenModeStyles')) return;
    const style = document.createElement('style');
    style.id = 'zenModeStyles';
    style.textContent = `
      body.zen-mode .topbar,
      body.zen-mode #appSidebar,
      body.zen-mode #sidebarResizer,
      body.zen-mode .tabs-bar,
      body.zen-mode .statusbar { display: none !important; }
    `;
    document.head.appendChild(style);
  }

  function toggleZenMode(force) {
    ensureStyles();
    zenActive = typeof force === 'boolean' ? force : !zenActive;
    document.body.classList.toggle('zen-mode', zenActive);
    window.CDO?.toast?.show?.({
      message: zenActive ? 'Modo Zen ativado (F11 ou Ctrl+Alt+Z para sair)' : 'Modo Zen desativado',
      type: 'info',
      durationMs: 2500
    });
  }

  function init() {
    const reg = window.CDO?.commands;
    if (reg?.register) {
      reg.register({
        id: 'layout.zenMode',
        title: 'Alternar Modo Zen (Layout Focado)',
        category: 'Layout',
        defaultKeys: 'F11',
        run: () => toggleZenMode()
      });
      reg.register({
        id: 'layout.maximizeRequest',
        title: 'Maximizar / Restaurar Painel de Request',
        category: 'Layout',
        defaultKeys: 'Ctrl+Shift+M',
        run: () => document.getElementById('btnMaxReqPane')?.click()
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'F11' || ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 'z')) {
        e.preventDefault();
        toggleZenMode();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        document.getElementById('btnMaxReqPane')?.click();
      } else if (e.key === 'Escape' && zenActive) {
        toggleZenMode(false);
      }
    });
  }

  window.CDO = window.CDO || {};
  window.CDO.zenMode = { toggle: toggleZenMode };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
