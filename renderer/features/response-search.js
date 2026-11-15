/* U-12: busca textual no corpo da resposta + navegação entre ocorrências. */
(function () {
  'use strict';

  const app = () => window.CDO?.app;
  const ts = () => window.CDO?.textSearch;

  let currentIdx = -1;

  function query() {
    return (app()?.state?.responseBodySearch || '').trim();
  }

  function bodyText() {
    const tab = app()?.getActiveTab?.();
    return String(tab?.response?.body ?? document.getElementById('responseBodyPre')?.textContent ?? '');
  }

  function apply() {
    const q = query();
    const countEl = document.getElementById('resSearchCount');
    const prevBtn = document.getElementById('btnResSearchPrev');
    const nextBtn = document.getElementById('btnResSearchNext');
    const bodyPre = document.getElementById('responseBodyPre');
    if (!bodyPre) return;

    if (!q) {
      currentIdx = -1;
      [countEl, prevBtn, nextBtn].forEach((el) => el?.classList.add('hidden'));
      // Re-render normal remove o destaque.
      if (typeof renderResponse === 'function') renderResponse(app()?.getActiveTab?.());
      return;
    }

    const { html, count } = ts().highlight(bodyText(), q, 'res-search-hit');
    bodyPre.innerHTML = html;
    bodyPre.classList.add('res-search-active');

    const has = count > 0;
    [countEl, prevBtn, nextBtn].forEach((el) => el?.classList.toggle('hidden', !has));
    if (countEl) countEl.textContent = has ? `1/${count}` : '0 ocorrências';
    if (has) goTo(0);
    else currentIdx = -1;
  }

  function marks() {
    return Array.from(document.querySelectorAll('#responseBodyPre mark.res-search-hit'));
  }

  function goTo(i) {
    const els = marks();
    if (!els.length) return;
    currentIdx = ((i % els.length) + els.length) % els.length;
    els.forEach((el, j) => el.classList.toggle('res-search-current', j === currentIdx));
    els[currentIdx].scrollIntoView({ block: 'center', behavior: 'smooth' });
    const countEl = document.getElementById('resSearchCount');
    if (countEl) countEl.textContent = `${currentIdx + 1}/${els.length}`;
  }

  function init() {
    const st = document.createElement('style');
    st.textContent = `
      #responseBodyPre mark.res-search-hit{background:#7c2d12;color:#fff;border-radius:2px;padding:0 1px}
      #responseBodyPre mark.res-search-current{background:#f59e0b;color:#000;outline:1px solid #fbbf24}
      #responseBodyPre.res-search-active{white-space:pre-wrap;word-break:break-word}
    `;
    document.head.appendChild(st);

    document.getElementById('resBodySearchInput')?.addEventListener('input', (e) => {
      app().state.responseBodySearch = e.target.value;
      apply();
    });
    document.getElementById('btnResSearchNext')?.addEventListener('click', () => goTo(currentIdx + 1));
    document.getElementById('btnResSearchPrev')?.addEventListener('click', () => goTo(currentIdx - 1));

    // Reaplica destaque após cada render de resposta (nova resposta, troca de aba).
    window.CDO?.hookBus?.on?.('response:rendered', () => { if (query()) apply(); });
    window.CDO?.hookBus?.on?.('tab:activated', () => { if (query()) apply(); });
    apply();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  window.CDO = window.CDO || {};
  window.CDO.responseSearch = { apply, goTo, query };
})();
