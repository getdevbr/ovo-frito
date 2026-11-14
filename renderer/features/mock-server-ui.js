(function () {
  'use strict';

  function app() {
    return window.CDO?.app || null;
  }

  function isElectron() {
    return Boolean(window.pm && window.pm.sdk && window.pm.sdk.IPC);
  }

  function invoke(channel, payload) {
    return app()?.ipc?.invoke(channel, payload);
  }

  function subscribe(channel, listener) {
    if (window.pm?.sdk?.IPC?.subscribe) {
      return window.pm.sdk.IPC.subscribe(channel, (_event, payload) => listener(payload));
    }
    return () => {};
  }

  function statusEl() {
    return document.getElementById('statusMessage');
  }

  function initMockServerUI() {
    const topActions = document.getElementById('toolsMenuSlot') || document.querySelector('.topbar-actions');
    if (!topActions || document.getElementById('btnOpenMockModal')) return;

    const btn = document.createElement('button');
    btn.id = 'btnOpenMockModal';
    btn.type = 'button';
    btn.className = 'btn-small';
    btn.textContent = '🎭 Mock';
    btn.title = isElectron() ? 'Subir Mock Server local 127.0.0.1 para uma Collection' : 'Disponível apenas no app Electron';
    if (!isElectron()) btn.disabled = true;
    topActions.appendChild(btn);

    const modalHtml = `
      <div id="mockServerModal" class="modal-backdrop hidden">
        <div class="modal modal-large">
          <div class="modal-header">
            <h3>🎭 Mock Server Local (127.0.0.1)</h3>
            <button id="btnCloseMockModal" class="btn-icon">✕</button>
          </div>
          <div class="modal-body">
            <div class="pane-header" style="flex-wrap:wrap; gap:8px;">
              <label>Collection:</label>
              <select id="mockCollectionSelect" class="select-input" style="min-width:220px;"></select>
              <label>Porta:</label>
              <input id="mockPortInput" type="number" class="text-input" style="width:90px;" value="4000" min="0" max="65535" />
              <label><input id="mockCorsInput" type="checkbox" checked /> CORS</label>
              <button id="btnMockStart" class="btn-send" style="height:32px;">▶ Start</button>
              <button id="btnMockStop" class="btn-small btn-danger-ghost">■ Stop</button>
              <button id="btnMockRefresh" class="btn-small">↻ Status</button>
            </div>
            <div id="mockStatusBox" class="chain-box" style="margin-top:8px;">
              <div class="chain-box-title">Status</div>
              <div id="mockStatusText" class="badge">Parado</div>
              <div id="mockUrlText" style="margin-top:6px; font-family:var(--font-mono); word-break:break-all;"></div>
              <div id="mockRoutesList" style="margin-top:8px; max-height:120px; overflow:auto;"></div>
            </div>
            <div class="chain-box" style="margin-top:8px;">
              <div class="chain-box-title">Log de requisições mockadas</div>
              <div id="mockLogList" class="res-tests-list" style="max-height:180px; overflow:auto;"></div>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = document.getElementById('mockServerModal');
    const logs = [];
    let unsubLog = null;

    function populateCollections() {
      const sel = document.getElementById('mockCollectionSelect');
      if (!sel) return;
      sel.innerHTML = '';
      for (const col of app()?.state?.collections || []) {
        const opt = document.createElement('option');
        opt.value = col.id;
        opt.textContent = col.name || col.id;
        sel.appendChild(opt);
      }
    }

    function renderStatus(status) {
      const text = document.getElementById('mockStatusText');
      const url = document.getElementById('mockUrlText');
      const routes = document.getElementById('mockRoutesList');
      if (!text || !url || !routes) return;
      if (status?.running) {
        text.textContent = `Rodando em ${status.host}:${status.port} (${(status.routes || []).length} rotas)`;
        url.textContent = status.url || '';
        routes.innerHTML = '';
        for (const r of status.routes || []) {
          const row = document.createElement('div');
          row.className = 'test-result-item';
          row.textContent = `${r.method} ${r.pathname} → ${r.name || r.itemId}`;
          routes.appendChild(row);
        }
      } else {
        text.textContent = 'Parado';
        url.textContent = '';
        routes.innerHTML = '';
      }
    }

    function renderLogs() {
      const list = document.getElementById('mockLogList');
      if (!list) return;
      list.innerHTML = '';
      for (const entry of logs.slice(-80).reverse()) {
        const row = document.createElement('div');
        row.className = 'test-result-item';
        row.innerHTML = `<span class="method-badge method-${window.CDO.escape.escapeHtml(entry.method || 'GET')}">${window.CDO.escape.escapeHtml(entry.method || 'GET')}</span><span style="flex:1;">${window.CDO.escape.escapeHtml(entry.path || '')}</span><span class="badge">${window.CDO.escape.escapeHtml(entry.status ?? '')}</span><span class="badge">${window.CDO.escape.escapeHtml(entry.ms ?? 0)} ms</span>`;
        list.appendChild(row);
      }
      if (logs.length === 0) {
        list.innerHTML = '<div class="empty-hint">Nenhuma requisição mockada ainda.</div>';
      }
    }

    async function refreshStatus() {
      if (!isElectron()) return;
      const res = await invoke('pm:mock:status');
      renderStatus(res || { running: false });
    }

    btn.addEventListener('click', async () => {
      populateCollections();
      modal.classList.remove('hidden');
      await refreshStatus();
      if (!unsubLog) {
        unsubLog = subscribe('pm:mock:log', (entry) => {
          logs.push(entry);
          if (logs.length > 200) logs.shift();
          renderLogs();
        });
      }
    });

    document.getElementById('btnCloseMockModal')?.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });

    document.getElementById('btnMockRefresh')?.addEventListener('click', refreshStatus);
    document.getElementById('btnMockStart')?.addEventListener('click', async () => {
      if (!isElectron()) return;
      const collectionId = document.getElementById('mockCollectionSelect')?.value;
      if (!collectionId) {
        if (statusEl()) statusEl().textContent = 'Selecione uma Collection para o Mock Server.';
        return;
      }
      const res = await invoke('pm:mock:start', {
        collectionId,
        port: Number(document.getElementById('mockPortInput')?.value || 4000),
        host: '127.0.0.1',
        cors: Boolean(document.getElementById('mockCorsInput')?.checked),
        variables: {}
      });
      if (res?.ok) {
        renderStatus({ running: true, ...res });
        if (statusEl()) statusEl().textContent = `Mock Server ativo em ${res.url}`;
      } else {
        renderStatus({ running: false });
        if (statusEl()) statusEl().textContent = `Falha ao iniciar Mock Server: ${res?.error?.message || res?.error || 'erro'}`;
      }
    });
    document.getElementById('btnMockStop')?.addEventListener('click', async () => {
      if (!isElectron()) return;
      await invoke('pm:mock:stop');
      renderStatus({ running: false });
      if (statusEl()) statusEl().textContent = 'Mock Server parado.';
    });

    const toolbar = document.getElementById('resGenerateMenuSlot') || document.querySelector('.res-body-toolbar .chain-actions');
    if (toolbar && !document.getElementById('btnSaveMockExample')) {
      const saveBtn = document.createElement('button');
      saveBtn.id = 'btnSaveMockExample';
      saveBtn.type = 'button';
      saveBtn.className = 'btn-small';
      saveBtn.title = 'Salvar resposta atual como exemplo de Mock desta requisição';
      saveBtn.textContent = '🎭 Exemplo';
      toolbar.appendChild(saveBtn);

      saveBtn.addEventListener('click', async () => {
        const a = app();
        const tab = a?.getActiveTab?.();
        const col = a?.state?.collections?.find((c) => c.id === tab?.collectionId);
        const item = (col?.items || []).find((it) => it.id === tab?.collectionItemId);
        if (!item) {
          if (statusEl()) statusEl().textContent = 'Salve a requisição em uma Collection antes de criar exemplo de Mock.';
          return;
        }
        const name = window.prompt('Nome do exemplo de mock:', `${item.name || 'exemplo'} — resposta atual`);
        if (name === null) return;
        const headers = Object.entries(tab.response?.headers || {})
          .filter(([k]) => !['content-length', 'transfer-encoding', 'connection'].includes(String(k).toLowerCase()))
          .map(([key, value]) => ({ key, value: Array.isArray(value) ? value.join(', ') : String(value), enabled: true }));
        item.mockExamples = Array.isArray(item.mockExamples) ? item.mockExamples : [];
        item.mockExamples.push({
          id: `mock_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: name.trim() || `Exemplo ${item.mockExamples.length + 1}`,
          status: Number(tab.response?.status) || 200,
          headers,
          body: tab.response?.bodyEncoding === 'base64' ? '' : String(tab.response?.body || ''),
          delayMs: 0,
          isDefault: item.mockExamples.length === 0
        });
        await a.persistStore('collections');
        if (statusEl()) statusEl().textContent = `Exemplo de Mock salvo em "${item.name}".`;
      });
    }
  }

  if (window.CDO?.hookBus) {
    window.CDO.hookBus.on('app:ready', initMockServerUI);
  } else {
    window.addEventListener('DOMContentLoaded', initMockServerUI);
  }
})();
