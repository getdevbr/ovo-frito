(function () {
  'use strict';

  function app() {
    return window.CDO?.app || null;
  }

  function statusEl() {
    return document.getElementById('statusMessage');
  }

  function initApiDocsUI() {
    const actions = document.getElementById('workspaceMenuSlot') || document.querySelector('.request-header-actions');
    if (!actions || document.getElementById('btnOpenApiDocsModal')) return;

    const btn = document.createElement('button');
    btn.id = 'btnOpenApiDocsModal';
    btn.type = 'button';
    btn.className = 'btn-secondary';
    btn.innerHTML = `${window.CDO?.icons?.svg?.('file-text') || ''} Docs`;
    btn.title = 'Exportar Collection em documentação estática (Markdown ou HTML single-file)';
    actions.appendChild(btn);

    const modalHtml = `
      <div id="apiDocsModal" class="modal-backdrop hidden">
        <div class="modal modal-large">
          <div class="modal-header">
            <h3>📄 Documentação Estática da Collection</h3>
            <button id="btnCloseApiDocsModal" class="btn-icon">✕</button>
          </div>
          <div class="modal-body">
            <div class="pane-header" style="flex-wrap:wrap; gap:8px;">
              <label>Collection:</label>
              <select id="apiDocsCollectionSelect" class="select-input" style="min-width:220px;"></select>
              <label>Formato:</label>
              <select id="apiDocsFormatSelect" class="select-input">
                <option value="markdown">Markdown (API_DOCS.md)</option>
                <option value="html">HTML single-file</option>
              </select>
              <button id="btnApiDocsPreview" class="btn-small">👁 Preview</button>
              <button id="btnApiDocsDownload" class="btn-send" style="height:32px;">💾 Baixar</button>
            </div>
            <pre id="apiDocsPreviewPre" class="response-pre" style="min-height:280px; max-height:460px; overflow:auto;"></pre>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = document.getElementById('apiDocsModal');

    function selectedCollection() {
      const id = document.getElementById('apiDocsCollectionSelect')?.value;
      return app()?.state?.collections?.find((c) => c.id === id) || app()?.state?.collections?.[0] || null;
    }

    function buildDocs() {
      const col = selectedCollection();
      if (!col) return { content: '', filename: 'API_DOCS.md' };
      const format = document.getElementById('apiDocsFormatSelect')?.value || 'markdown';
      if (format === 'html') {
        return { content: window.CDO.apiDocs.collectionsToHtml([col], { title: col.name || 'API Documentation' }), filename: `${slug(col.name)}-docs.html` };
      }
      return { content: window.CDO.apiDocs.collectionsToMarkdown([col], { title: col.name || 'API Documentation' }), filename: 'API_DOCS.md' };
    }

    function slug(name) {
      return String(name || 'collection').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'collection';
    }

    function populate() {
      const sel = document.getElementById('apiDocsCollectionSelect');
      if (!sel) return;
      sel.innerHTML = '';
      for (const col of app()?.state?.collections || []) {
        const opt = document.createElement('option');
        opt.value = col.id;
        opt.textContent = col.name || col.id;
        sel.appendChild(opt);
      }
    }

    function renderPreview() {
      const pre = document.getElementById('apiDocsPreviewPre');
      if (!pre) return;
      const { content } = buildDocs();
      pre.textContent = content || 'Nenhuma Collection disponível.';
    }

    btn.addEventListener('click', () => {
      populate();
      modal.classList.remove('hidden');
      renderPreview();
    });
    document.getElementById('btnCloseApiDocsModal')?.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
    document.getElementById('apiDocsCollectionSelect')?.addEventListener('change', renderPreview);
    document.getElementById('apiDocsFormatSelect')?.addEventListener('change', renderPreview);
    document.getElementById('btnApiDocsPreview')?.addEventListener('click', renderPreview);
    document.getElementById('btnApiDocsDownload')?.addEventListener('click', () => {
      const { content, filename } = buildDocs();
      if (!content) return;
      const isHtml = filename.endsWith('.html');
      const blob = new Blob([content], { type: isHtml ? 'text/html;charset=utf-8' : 'text/markdown;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      if (statusEl()) statusEl().textContent = `Documentação exportada: ${filename}`;
    });
  }

  if (window.CDO?.hookBus) {
    window.CDO.hookBus.on('app:ready', initApiDocsUI);
  } else {
    window.addEventListener('DOMContentLoaded', initApiDocsUI);
  }
})();
