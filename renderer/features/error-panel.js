(function () {
  'use strict';

  const hints = window.CDO?.errorHints;
  if (!hints) return;

  const ACTIONS = {
    'request.retry': () => window.CDO.app?.sendActiveRequest?.(),
    'request.focusUrl': () => {
      const el = document.getElementById('reqUrl');
      if (el) { el.focus(); el.select?.(); }
    },
    'auth.review': () => document.querySelector('[data-req-tab="auth"]')?.click(),
    'network.proxy': () => window.CDO.app?.openNetworkModal?.(),
    'settings.network': () => window.CDO.app?.openNetworkModal?.(),
    'settings.timeout': () => window.CDO.app?.openNetworkModal?.(),
    'vault.unlock': () => window.CDO?.vault?.requestUnlock?.(),
    'vault.open': () => window.CDO?.vault?.open?.() || window.CDO?.vault?.requestUnlock?.(),
    'vars.define': () => window.CDO?.toast?.show?.({ message: 'Defina a variável no Environment ou Collection.', type: 'info' }),
    'response.details': () => document.querySelector('[data-res-tab="headers"]')?.click()
  };

  let panel = null;

  function ensurePanel() {
    if (panel && panel.isConnected) return panel;
    const anchor = document.getElementById('responseBodyPre');
    if (!anchor) return null;
    panel = document.createElement('div');
    panel.id = 'errorHintPanel';
    panel.style.cssText = 'display:none;margin:0 0 8px;padding:10px 12px;border-radius:8px;border:1px solid #e67e55;background:rgba(230,126,85,.08);font-size:13px';
    anchor.parentNode.insertBefore(panel, anchor);
    return panel;
  }

  function errorCodeOf(response) {
    const e = response?.error;
    if (e && typeof e === 'object') return e.code || null;
    return null;
  }

  function update() {
    const p = ensurePanel();
    if (!p) return;
    const tab = window.CDO.app?.getActiveTab?.();
    const res = tab?.response;
    if (!res) { p.style.display = 'none'; p.innerHTML = ''; return; }

    const code = res.ok === false ? errorCodeOf(res) : null;
    const hint = hints.getHint({
      errorCode: code,
      status: res.status,
      headers: res.headers,
      request: { url: res.requestSent?.url || tab.url }
    });
    if (!hint) { p.style.display = 'none'; p.innerHTML = ''; return; }

    p.innerHTML = '';
    const title = document.createElement('div');
    title.style.cssText = 'font-weight:600;margin-bottom:2px';
    title.textContent = hint.title;
    p.appendChild(title);
    const msg = document.createElement('div');
    msg.style.cssText = 'color:var(--text-secondary);margin-bottom:6px';
    msg.textContent = hint.message;
    p.appendChild(msg);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center';
    (hint.actions || []).forEach((a) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn-small';
      b.textContent = a.label;
      b.addEventListener('click', () => {
        const fn = ACTIONS[a.id];
        if (fn) { try { fn(); } catch (e) { console.error(e); } }
      });
      row.appendChild(b);
    });
    p.appendChild(row);

    if (res.ok === false) {
      const det = document.createElement('details');
      det.style.marginTop = '8px';
      const sum = document.createElement('summary');
      sum.textContent = 'Detalhes técnicos';
      sum.style.cursor = 'pointer';
      det.appendChild(sum);
      const pre = document.createElement('pre');
      pre.className = 'response-pre';
      pre.style.cssText = 'max-height:160px;overflow:auto;font-size:11px;margin-top:4px';
      pre.textContent = JSON.stringify({ code, error: res.error, status: res.status, statusText: res.statusText, timeMs: res.timeMs }, null, 2);
      det.appendChild(pre);
      p.appendChild(det);
    }
    p.style.display = 'block';
  }

  const bus = window.CDO?.hookBus;
  if (bus?.on) {
    ['request:completed', 'tab:activated', 'app:ready'].forEach((evt) => {
      bus.on(evt, () => setTimeout(update, 0));
    });
  }
  // fallback: atualiza quando a aba de resposta é re-renderizada
  const obs = new MutationObserver(() => update());
  const bodyPre = document.getElementById('responseBodyPre');
  if (bodyPre?.parentNode) obs.observe(bodyPre.parentNode, { childList: true, subtree: false });
  update();
})();
