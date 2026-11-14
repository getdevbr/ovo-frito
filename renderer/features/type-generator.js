(function () {
  'use strict';

  function initTypeGenerator() {
    const toolbar = document.getElementById('resGenerateMenuSlot') || document.querySelector('.res-body-toolbar .chain-actions');
    if (!toolbar || document.getElementById('btnOpenTypeGenModal')) return;

    const btn = document.createElement('button');
    btn.id = 'btnOpenTypeGenModal';
    btn.type = 'button';
    btn.className = 'btn-small';
    btn.title = 'Gerar interfaces TypeScript, Zod, Python, Java ou Go a partir do JSON da resposta';
    btn.textContent = '🧬 Tipos';
    toolbar.appendChild(btn);

    const modalHtml = `
      <div id="typeGenModal" class="modal-backdrop hidden">
        <div class="modal modal-large">
          <div class="modal-header">
            <h3>🧬 Gerar Tipos da Resposta</h3>
            <button id="btnCloseTypeGenModal" class="btn-icon">✕</button>
          </div>
          <div class="modal-body">
            <div class="pane-header" style="gap:8px; flex-wrap:wrap;">
              <div class="chain-actions">
                <label for="typeGenLangSelect">Linguagem:</label>
                <select id="typeGenLangSelect" class="select-input">
                  <option value="typescript">TypeScript Interface</option>
                  <option value="zod">Zod Schema</option>
                  <option value="python">Python (Pydantic v2)</option>
                  <option value="java">Java Record</option>
                  <option value="go">Go Struct</option>
                </select>
                <label for="typeGenRootInput">Nome raiz:</label>
                <input id="typeGenRootInput" type="text" class="text-input" style="max-width:160px;" value="Root" />
              </div>
              <button id="btnCopyTypeGen" class="btn-small">📋 Copiar</button>
            </div>
            <pre id="typeGenOutputPre" class="response-pre" style="min-height:260px;"></pre>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    function renderOutput() {
      const tab = window.CDO?.app?.getActiveTab?.();
      const raw = tab?.response?.body || '';
      const pre = document.getElementById('typeGenOutputPre');
      const lang = document.getElementById('typeGenLangSelect')?.value || 'typescript';
      const rootName = document.getElementById('typeGenRootInput')?.value.trim() || 'Root';
      if (!pre) return;

      try {
        const parsed = JSON.parse(raw);
        const ir = window.CDO.schemaIr.inferIr(parsed);
        pre.textContent = window.CDO.typeEmitters.emitTypes(ir, lang, rootName);
      } catch (err) {
        pre.textContent = `Resposta atual não é um JSON válido (${err.message}).`;
      }
    }

    btn.addEventListener('click', () => {
      renderOutput();
      document.getElementById('typeGenModal')?.classList.remove('hidden');
    });

    document.getElementById('btnCloseTypeGenModal')?.addEventListener('click', () => {
      document.getElementById('typeGenModal')?.classList.add('hidden');
    });
    document.getElementById('typeGenLangSelect')?.addEventListener('change', renderOutput);
    document.getElementById('typeGenRootInput')?.addEventListener('input', renderOutput);
    document.getElementById('btnCopyTypeGen')?.addEventListener('click', () => {
      const text = document.getElementById('typeGenOutputPre')?.textContent || '';
      navigator.clipboard?.writeText(text);
    });
  }

  if (window.CDO?.hookBus) {
    window.CDO.hookBus.on('app:ready', initTypeGenerator);
  } else {
    window.addEventListener('DOMContentLoaded', initTypeGenerator);
  }
})();
