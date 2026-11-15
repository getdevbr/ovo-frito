/* U-03: drag-and-drop de arquivos (.ovo, .bru, cURL, OpenAPI) na janela. */
(function () {
  'use strict';

  let dragDepth = 0;
  let overlay = null;

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'fileDropOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:20000;display:none;align-items:center;justify-content:center;background:rgba(30,41,59,.72);border:3px dashed var(--accent,#4f8cff);pointer-events:none;';
    overlay.innerHTML = '<div style="font-size:18px;font-weight:600;color:#fff;background:rgba(0,0,0,.55);padding:14px 22px;border-radius:10px;">Solte o arquivo aqui (.ovo, .bru, cURL, OpenAPI)</div>';
    document.body.appendChild(overlay);
    return overlay;
  }

  function showOverlay() { ensureOverlay().style.display = 'flex'; }
  function hideOverlay() { if (overlay) overlay.style.display = 'none'; dragDepth = 0; }

  function importText(text, fileName) {
    const ta = document.getElementById('importTextarea');
    const btn = document.getElementById('btnConfirmImport');
    if (!ta || !btn) return;
    ta.value = String(text || '');
    // Reutiliza todo o pipeline de importação (ovo, curl, bru, openapi, postman).
    btn.click();
    window.CDO?.toast?.show({ message: `Arquivo "${fileName}" enviado para importação.`, type: 'success' });
  }

  async function handleFiles(files) {
    const file = Array.from(files || []).find((f) => /\.(ovo|bru|json|txt|http|rest)$/i.test(f.name) || f.type.includes('json') || f.type.includes('text'));
    if (!file) {
      window.CDO?.toast?.show({ message: 'Formato não suportado. Use .ovo, .bru, .json ou texto cURL.', type: 'warn' });
      return;
    }
    const text = await file.text();
    importText(text, file.name);
  }

  function init() {
    ensureOverlay();

    window.addEventListener('dragenter', (e) => {
      if (e.dataTransfer?.types?.includes('Files')) { dragDepth++; showOverlay(); }
    });
    window.addEventListener('dragleave', () => { if (--dragDepth <= 0) hideOverlay(); });
    window.addEventListener('dragover', (e) => {
      if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
    });
    window.addEventListener('drop', (e) => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      hideOverlay();
      handleFiles(e.dataTransfer.files);
    });

    // Colar/abrir .ovo via seletor de arquivo também fica acessível pela paleta.
    const reg = window.CDO?.commands;
    if (reg?.register) {
      try {
        reg.register({
          id: 'action.openFile',
          title: '📂 Abrir arquivo de Requisição (.ovo, .bru, cURL, OpenAPI...)',
          category: 'Importação',
          sub: 'Selecionar arquivo do disco',
          run: () => document.getElementById('importFileInput')?.click()
        });
      } catch (err) { console.warn('openFile register:', err.message); }
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  window.CDO = window.CDO || {};
  window.CDO.fileDrop = { importText, handleFiles };
})();
