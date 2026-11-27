(function () {
  'use strict';

  function app() { return window.CDO?.app || null; }

  function setBaseline() {
    const a = app();
    const tab = a?.getActiveTab?.();
    if (!tab?.response) {
      window.CDO?.toast?.show?.({ message: 'Envie uma requisição primeiro para marcar como baseline.', type: 'warning' });
      return;
    }
    tab.baselineResponse = {
      status: tab.response.status,
      timeMs: tab.response.timeMs,
      body: tab.response.body,
      savedAt: new Date().toISOString()
    };
    a.syncTabBackToCollectionItem?.(tab, { includeHistory: false });
    a.saveSessionState?.();
    window.CDO?.toast?.show?.({ message: 'Resposta marcada como Baseline!', type: 'success' });
  }

  function compareWithBaseline() {
    const a = app();
    const tab = a?.getActiveTab?.();
    if (!tab?.response || !tab?.baselineResponse) {
      window.CDO?.toast?.show?.({ message: 'É necessário ter uma resposta atual e uma Baseline salva.', type: 'warning' });
      return;
    }
    const diffLib = window.CDO?.jsonDiff;
    let details = '';
    try {
      const baseJson = JSON.parse(tab.baselineResponse.body || 'null');
      const curJson = JSON.parse(tab.response.body || 'null');
      if (diffLib && baseJson !== null && curJson !== null) {
        const changes = diffLib.diffJson(baseJson, curJson, { ignorePaths: tab.ignoreDiffPaths || '' });
        if (changes.length === 0) {
          details = 'Nenhuma diferença estrutural encontrada (considerando caminhos ignorados).';
        } else {
          details = changes
            .slice(0, 80)
            .map((c) => {
              if (c.type === 'added') return `+ ${c.path}: ${JSON.stringify(c.after)}`;
              if (c.type === 'removed') return `- ${c.path}: ${JSON.stringify(c.before)}`;
              return `~ ${c.path}: ${JSON.stringify(c.before)} -> ${JSON.stringify(c.after)}`;
            })
            .join('\n');
        }
      }
    } catch {
      details = tab.baselineResponse.body === tab.response.body
        ? 'Corpos textuais idênticos.'
        : 'Corpos textuais diferentes (não-JSON).';
    }

    window.CDO?.dialog?.confirm?.({
      title: 'Diff contra Baseline',
      message: `Baseline (${tab.baselineResponse.status}) vs Atual (${tab.response.status})`,
      details,
      confirmLabel: 'OK'
    });
  }

  function injectButtons() {
    const toolbar = document.querySelector('.res-body-toolbar .chain-actions');
    if (!toolbar || document.getElementById('btnMarkBaseline')) return;

    const btnMark = document.createElement('button');
    btnMark.id = 'btnMarkBaseline';
    btnMark.type = 'button';
    btnMark.className = 'btn-small';
    btnMark.textContent = '📌 Baseline';
    btnMark.title = 'Marcar resposta atual como Baseline (FUT-07)';
    btnMark.addEventListener('click', setBaseline);

    const btnCmp = document.createElement('button');
    btnCmp.id = 'btnCompareBaseline';
    btnCmp.type = 'button';
    btnCmp.className = 'btn-small';
    btnCmp.textContent = '⇄ Diff Baseline';
    btnCmp.title = 'Comparar resposta atual com a Baseline salva (FUT-07)';
    btnCmp.addEventListener('click', compareWithBaseline);

    toolbar.appendChild(btnMark);
    toolbar.appendChild(btnCmp);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectButtons);
  else injectButtons();
})();
