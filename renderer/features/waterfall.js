(function () {
  'use strict';

  function app() { return window.CDO?.app || null; }

  function fmt(ms) {
    if (ms === null || ms === undefined) return '—';
    return `${Math.round(ms)}ms`;
  }

  function renderWaterfall() {
    const meta = document.getElementById('responseMeta');
    const tab = app()?.getActiveTab?.();
    const timings = tab?.response?.timings;
    if (!meta) return;
    const showDetails = Boolean(app()?.state?.settings?.showTimingDetails);
    let pill = meta.querySelector('[data-waterfall]');
    if (!showDetails || !timings) {
      pill?.remove();
      return;
    }
    if (!pill) {
      pill = document.createElement('span');
      pill.className = 'meta-pill';
      pill.dataset.waterfall = '1';
      pill.style.cssText = 'cursor:pointer;font-size:11px;';
      pill.title = 'Waterfall: DNS / TCP / TLS / TTFB / Download';
      meta.appendChild(pill);
    }
    pill.textContent = `⏱ DNS ${fmt(timings.dnsMs)} · TCP ${fmt(timings.connectMs)} · TLS ${fmt(timings.tlsMs)} · TTFB ${fmt(timings.ttfbMs)} · DL ${fmt(timings.downloadMs)}`;
  }

  function init() {
    if (!window.CDO?.hookBus) return;
    window.CDO.hookBus.on('response:rendered', renderWaterfall);
    window.CDO.hookBus.on('request:completed', renderWaterfall);
    window.CDO.hookBus.on('tab:activated', renderWaterfall);
  }

  if (window.CDO?.hookBus) init(); else window.addEventListener('DOMContentLoaded', init);
})();
