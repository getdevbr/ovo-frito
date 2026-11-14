(function () {
  'use strict';

  function initContractSchema() {
    const toolbar = document.querySelector('.res-body-toolbar .chain-actions');
    if (!toolbar || document.getElementById('btnGenerateContract')) return;

    const btn = document.createElement('button');
    btn.id = 'btnGenerateContract';
    btn.type = 'button';
    btn.className = 'btn-small';
    btn.textContent = '📐 Contrato';
    btn.title = 'Gerar JSON Schema da resposta atual e ativar validação automática';
    toolbar.appendChild(btn);

    btn.addEventListener('click', async () => {
      const tab = window.CDO?.app?.getActiveTab?.();
      if (!tab?.response?.body) return;
      try {
        const parsed = JSON.parse(tab.response.body);
        const ir = window.CDO.schemaIr.inferIr(parsed);
        const schema = window.CDO.jsonSchema.irToJsonSchema(ir);
        tab.contract = { enabled: true, responseSchema: schema };
        const statusEl = document.getElementById('statusMessage');
        if (statusEl) statusEl.textContent = 'Contrato JSON Schema gerado e ativado para esta requisição!';
      } catch (err) {
        const statusEl = document.getElementById('statusMessage');
        if (statusEl) statusEl.textContent = `Não foi possível gerar contrato: ${err.message}`;
      }
    });

    if (window.CDO?.hookBus) {
      window.CDO.hookBus.on('request:completed', ({ tab, response }) => {
        if (!tab?.contract?.enabled || !tab?.contract?.responseSchema || !response?.body) return;
        try {
          const parsed = JSON.parse(response.body);
          const check = window.CDO.jsonSchema.validateJsonSchema(parsed, tab.contract.responseSchema);
          tab.testResults = tab.testResults || [];
          tab.testResults.push({
            source: 'schema',
            operator: 'matches',
            target: 'JSON Schema',
            actual: check.valid ? 'Válido' : check.errors.slice(0, 3).join('; '),
            passed: check.valid
          });
        } catch {
          // ignore non-JSON
        }
      });
    }
  }

  if (window.CDO?.hookBus) {
    window.CDO.hookBus.on('app:ready', initContractSchema);
  } else {
    window.addEventListener('DOMContentLoaded', initContractSchema);
  }
})();
