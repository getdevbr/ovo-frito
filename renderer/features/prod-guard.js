/* U-09: faixa vermelha + rótulo do botão quando o Profile ativo é Produção. */
(function () {
  'use strict';

  function isProdActive() {
    const envApi = window.CDO?.core?.profiles;
    const profile = typeof getActiveProfile === 'function' ? getActiveProfile() : null;
    return Boolean(envApi?.isActiveProfileProduction?.(profile));
  }

  function refreshProdGuard() {
    const strip = document.getElementById('prodGuardStrip');
    const btn = document.getElementById('btnSend');
    const prod = isProdActive();
    if (strip) strip.classList.toggle('hidden', !prod);
    if (btn) {
      const label = btn.querySelector('.btn-send-label') || btn;
      if (label.dataset?.origText === undefined) label.dataset.origText = label.textContent;
      label.textContent = prod ? 'Enviar em PROD' : label.dataset.origText;
      btn.classList.toggle('btn-send-prod', prod);
      btn.title = prod ? 'Ambiente de Produção — confirmação obrigatória' : '';
    }
  }

  function init() {
    refreshProdGuard();
    const bus = window.CDO?.hookBus;
    if (bus?.on) {
      ['sidebar:rendered', 'tab:activated', 'collection:changed'].forEach((ev) => bus.on(ev, refreshProdGuard));
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  window.CDO = window.CDO || {};
  window.CDO.prodGuard = { refreshProdGuard, isProdActive };
})();
