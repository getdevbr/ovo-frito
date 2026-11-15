/* U-13: comparar a resposta da aba ativa com a resposta de outra aba. */
(function () {
  'use strict';

  const app = () => window.CDO?.app;

  function tabsWithResponses() {
    const active = app()?.getActiveTab?.();
    return (app()?.state?.tabs || []).filter((t) => t !== active && t?.response?.body !== undefined);
  }

  function openPicker() {
    const tabs = tabsWithResponses();
    const active = app()?.getActiveTab?.();
    if (!active?.response) {
      window.CDO?.toast?.show({ message: 'Envie uma requisição primeiro para comparar respostas.', type: 'warn' });
      return;
    }
    if (tabs.length === 0) {
      window.CDO?.toast?.show({ message: 'Nenhuma outra aba com resposta para comparar.', type: 'warn' });
      return;
    }

    const ov = document.createElement('div');
    ov.className = 'ui-dialog-overlay';
    const dlg = document.createElement('div');
    dlg.className = 'ui-dialog';
    dlg.setAttribute('role', 'dialog');
    dlg.innerHTML = '<h2>⇄ Comparar Respostas</h2><p>Escolha a aba cuja resposta será comparada com a resposta atual:</p>';
    const list = document.createElement('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:6px;max-height:300px;overflow:auto;';
    tabs.forEach((t) => {
      const b = document.createElement('button');
      b.className = 'btn-small';
      b.style.cssText = 'text-align:left;';
      b.textContent = `${t.name || t.url || 'aba'} — ${t.response?.status ?? '?'} (${t.method || 'GET'})`;
      b.addEventListener('click', () => {
        ov.remove();
        if (typeof openHistoryDiffModal === 'function') {
          openHistoryDiffModal(active, {
            response: t.response,
            timestamp: `aba: ${t.name || t.url || ''}`,
            method: t.method,
            status: t.response?.status,
            timeMs: t.response?.timeMs
          });
        }
      });
      list.appendChild(b);
    });
    dlg.appendChild(list);
    const cancel = document.createElement('button');
    cancel.textContent = 'Cancelar';
    cancel.addEventListener('click', () => ov.remove());
    const actions = document.createElement('div');
    actions.className = 'ui-dialog-actions';
    actions.appendChild(cancel);
    dlg.appendChild(actions);
    ov.appendChild(dlg);
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
  }

  function init() {
    const reg = window.CDO?.commands;
    if (reg?.register) {
      try {
        reg.register({
          id: 'response.compareTabs',
          title: '⇄ Comparar Resposta com outra Aba',
          category: 'Resposta',
          sub: 'Diff lado a lado do corpo JSON',
          run: openPicker
        });
      } catch (e) { console.warn('compare register:', e.message); }
    }
    window.CDO = window.CDO || {};
    window.CDO.compareResponses = { openPicker, tabsWithResponses };
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})();
