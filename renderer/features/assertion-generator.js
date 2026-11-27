(function () {
  'use strict';

  function app() { return window.CDO?.app || null; }

  function buildCandidateAssertions(tab) {
    const res = tab?.response;
    if (!res) return [];
    const list = [];
    if (res.status) {
      list.push({ label: `Status == ${res.status}`, source: 'status', operator: '==', target: String(res.status), enabled: true });
    }
    const ctKey = Object.keys(res.headers || {}).find((k) => k.toLowerCase() === 'content-type');
    if (ctKey && res.headers[ctKey]) {
      list.push({
        label: `Header ${ctKey} contains ${String(res.headers[ctKey]).split(';')[0]}`,
        source: `header.${ctKey}`,
        operator: 'contains',
        target: String(res.headers[ctKey]).split(';')[0].trim(),
        enabled: true
      });
    }
    try {
      const parsed = JSON.parse(res.body || '');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        Object.entries(parsed).slice(0, 10).forEach(([k, v]) => {
          if (v !== null && typeof v !== 'object') {
            list.push({
              label: `json.${k} == ${String(v).slice(0, 40)}`,
              source: `json.${k}`,
              operator: '==',
              target: String(v),
              enabled: true
            });
          } else {
            list.push({
              label: `json.${k} exists`,
              source: `json.${k}`,
              operator: 'exists',
              target: '',
              enabled: true
            });
          }
        });
      } else if (Array.isArray(parsed) && parsed.length > 0) {
        list.push({ label: 'json[0] exists', source: 'json.0', operator: 'exists', target: '', enabled: true });
      }
    } catch {}
    return list;
  }

  async function openBatchGenerator() {
    const a = app();
    const tab = a?.getActiveTab?.();
    if (!tab?.response) {
      window.CDO?.toast?.show?.({ message: 'Envie a requisição primeiro para gerar assertions da resposta.', type: 'warning' });
      return;
    }
    const candidates = buildCandidateAssertions(tab);
    if (candidates.length === 0) {
      window.CDO?.toast?.show?.({ message: 'Nenhum campo detectado para gerar assertions.', type: 'info' });
      return;
    }

    const ok = await window.CDO?.dialog?.confirm?.({
      title: `Gerar ${candidates.length} Assertions da Resposta`,
      message: 'Deseja adicionar estas assertions à requisição atual?',
      details: candidates.map((c) => `• ${c.label}`).join('\n'),
      confirmLabel: 'Adicionar Todas'
    });
    if (!ok) return;

    if (!Array.isArray(tab.assertions)) tab.assertions = [];
    const existingKeys = new Set(tab.assertions.map((x) => `${x.source}|${x.operator}|${x.target}`));
    let added = 0;
    candidates.forEach((c) => {
      const k = `${c.source}|${c.operator}|${c.target}`;
      if (!existingKeys.has(k)) {
        tab.assertions.push({ source: c.source, operator: c.operator, target: c.target, enabled: true });
        added++;
      }
    });
    a.renderAll();
    window.CDO?.toast?.show?.({ message: `${added} assertion(s) adicionada(s)!`, type: 'success' });
  }

  function init() {
    const btn = document.getElementById('btnGenerateBatchAssertions');
    if (!btn || btn.dataset.batchAssertBound) return;
    btn.dataset.batchAssertBound = '1';
    btn.addEventListener('click', openBatchGenerator);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
