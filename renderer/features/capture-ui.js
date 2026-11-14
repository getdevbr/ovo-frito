(function () {
  'use strict';

  const SENSITIVE_HEADERS = new Set(['authorization', 'proxy-authorization', 'cookie', 'set-cookie']);

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

  function maskValue(key, value) {
    if (SENSITIVE_HEADERS.has(String(key).toLowerCase())) return '••••••••';
    return String(value ?? '');
  }

  function headersToArray(headersObj) {
    return Object.entries(headersObj || {}).map(([key, value]) => ({
      key,
      value: Array.isArray(value) ? value.join(', ') : String(value ?? ''),
      enabled: true
    }));
  }

  function initCaptureUI() {
    const topActions = document.getElementById('toolsMenuSlot') || document.querySelector('.topbar-actions');
    if (!topActions || document.getElementById('btnOpenCaptureModal')) return;

    const btn = document.createElement('button');
    btn.id = 'btnOpenCaptureModal';
    btn.type = 'button';
    btn.className = 'btn-small';
    btn.textContent = '📡 Captura';
    btn.title = isElectron() ? 'Proxy interceptor local para capturar tráfego HTTP' : 'Disponível apenas no app Electron';
    if (!isElectron()) btn.disabled = true;
    topActions.appendChild(btn);

    const modalHtml = `
      <div id="captureModal" class="modal-backdrop hidden">
        <div class="modal modal-large">
          <div class="modal-header">
            <h3>📡 Proxy Interceptor Local</h3>
            <button id="btnCloseCaptureModal" class="btn-icon">✕</button>
          </div>
          <div class="modal-body">
            <div class="env-profile-config-card">
              <div class="pane-header" style="flex-wrap:wrap; gap:8px;">
                <label>Porta:</label>
                <input id="capturePortInput" type="number" class="text-input" style="width:90px;" value="8888" min="0" max="65535" />
                <button id="btnCaptureStart" class="btn-send" style="height:32px;">▶ Start</button>
                <button id="btnCaptureStop" class="btn-small btn-danger-ghost">■ Stop</button>
                <button id="btnCaptureClear" class="btn-small">🧹 Limpar</button>
              </div>
              <div id="captureProxyUrl" style="margin-top:8px; font-family:var(--font-mono); word-break:break-all;"></div>
              <div style="font-size:12px; color:var(--text-secondary); margin-top:6px;">
                Configure o proxy do sistema, navegador ou emulador para <code>127.0.0.1</code> na porta acima. Túnel <code>CONNECT</code> registra só metadados (HTTPS fica criptografado).
              </div>
            </div>
            <div class="pane-header" style="margin-top:8px; flex-wrap:wrap; gap:8px;">
              <label>Salvar em Collection:</label>
              <select id="captureSaveCollectionSelect" class="select-input" style="min-width:180px;"></select>
              <input id="captureFilterInput" type="text" class="kv-input" placeholder="Filtrar método/host/status..." />
            </div>
            <div id="captureEntriesList" class="res-tests-list" style="min-height:220px; max-height:380px; overflow:auto;"></div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = document.getElementById('captureModal');
    const entries = [];
    let unsubEntry = null;

    function populateCollections() {
      const sel = document.getElementById('captureSaveCollectionSelect');
      if (!sel) return;
      sel.innerHTML = '';
      for (const col of app()?.state?.collections || []) {
        const opt = document.createElement('option');
        opt.value = col.id;
        opt.textContent = col.name || col.id;
        sel.appendChild(opt);
      }
    }

    function entryMatches(entry) {
      const q = (document.getElementById('captureFilterInput')?.value || '').trim().toLowerCase();
      if (!q) return true;
      return [entry.method, entry.url, entry.status, entry.kind, entry.note].some((v) => String(v || '').toLowerCase().includes(q));
    }

    function renderEntries() {
      const list = document.getElementById('captureEntriesList');
      if (!list) return;
      list.innerHTML = '';
      const visible = entries.filter(entryMatches).slice(-200).reverse();
      if (visible.length === 0) {
        list.innerHTML = '<div class="empty-hint">Nenhuma requisição capturada ainda.</div>';
        return;
      }
      for (const entry of visible) {
        const row = document.createElement('div');
        row.className = 'test-result-item';
        row.style.flexWrap = 'wrap';
        const isConnect = entry.kind === 'connect';
        const method = entry.method || (isConnect ? 'CONNECT' : 'GET');
        row.innerHTML = `
          <span class="method-badge method-${window.CDO.escape.escapeHtml(method)}">${window.CDO.escape.escapeHtml(method)}</span>
          <span style="flex:1; min-width:220px; word-break:break-all;">${window.CDO.escape.escapeHtml(entry.url || '')}</span>
          <span class="badge">${window.CDO.escape.escapeHtml(entry.status ?? '')}</span>
          <span class="badge">${window.CDO.escape.escapeHtml(entry.timeMs ?? 0)} ms</span>
          ${isConnect ? '<span class="badge">HTTPS criptografado</span>' : ''}
        `;
        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex; gap:6px; margin-left:auto;';

        const openBtn = document.createElement('button');
        openBtn.className = 'btn-small';
        openBtn.textContent = 'Abrir';
        openBtn.disabled = isConnect;
        openBtn.title = isConnect ? 'CONNECT não tem corpo/headers decifrados' : 'Abrir em nova aba';
        openBtn.addEventListener('click', () => openEntryInTab(entry));
        actions.appendChild(openBtn);

        const saveBtn = document.createElement('button');
        saveBtn.className = 'btn-small';
        saveBtn.textContent = 'Salvar';
        saveBtn.disabled = isConnect;
        saveBtn.title = isConnect ? 'CONNECT não pode ser salvo como request HTTP' : 'Salvar na Collection selecionada';
        saveBtn.addEventListener('click', () => saveEntryToCollection(entry));
        actions.appendChild(saveBtn);

        const detailBtn = document.createElement('button');
        detailBtn.className = 'btn-small';
        detailBtn.textContent = 'Detalhe';
        detailBtn.addEventListener('click', () => showEntryDetail(entry));
        actions.appendChild(detailBtn);

        row.appendChild(actions);
        list.appendChild(row);
      }
    }

    function openEntryInTab(entry) {
      const a = app();
      if (!a || entry.kind === 'connect') return;
      const tab = a.createBlankTab({
        name: `${entry.method || 'GET'} ${new URL(entry.url).hostname}`,
        method: entry.method || 'GET',
        url: entry.url || '',
        headers: headersToArray(entry.reqHeaders).filter((h) => !SENSITIVE_HEADERS.has(h.key.toLowerCase())),
        body: entry.reqBody ? { mode: 'raw', raw: entry.reqBody, urlencoded: [], formdata: [] } : { mode: 'none', raw: '', urlencoded: [], formdata: [] }
      });
      a.state.tabs.push(tab);
      a.state.activeTabId = tab.id;
      a.saveSessionState?.();
      a.renderAll?.();
    }

    function saveEntryToCollection(entry) {
      const a = app();
      const colId = document.getElementById('captureSaveCollectionSelect')?.value;
      const col = a?.state?.collections?.find((c) => c.id === colId);
      if (!col || entry.kind === 'connect') return;
      const host = (() => {
        try { return new URL(entry.url).hostname; } catch { return entry.url; }
      })();
      const item = {
        id: `cap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: `${entry.method || 'GET'} ${host}`,
        folder: 'Capturado',
        method: entry.method || 'GET',
        url: entry.url || '',
        params: [],
        headers: headersToArray(entry.reqHeaders),
        auth: { type: 'none', token: '', username: '', password: '', keyName: '', keyValue: '', addTo: 'header' },
        body: entry.reqBody ? { mode: 'raw', raw: entry.reqBody, graphqlQuery: '', graphqlVars: '{\n  \n}', urlencoded: [], formdata: [] } : { mode: 'none', raw: '', graphqlQuery: '', graphqlVars: '{\n  \n}', urlencoded: [], formdata: [] },
        assertions: [{ source: 'status', operator: '==', target: String(entry.status || 200), enabled: true }],
        captures: [],
        preRequestScript: '',
        postResponseScript: ''
      };
      col.items = [...(col.items || []), item];
      a.persistStore('collections').then(() => {
        if (statusEl()) statusEl().textContent = `Requisição capturada salva em "${col.name}". Headers sensíveis foram preservados.`;
      });
    }

    function showEntryDetail(entry) {
      const pre = document.createElement('pre');
      pre.className = 'response-pre';
      pre.style.cssText = 'margin-top:8px; max-height:260px; overflow:auto;';
      const maskedReq = Object.fromEntries(Object.entries(entry.reqHeaders || {}).map(([k, v]) => [k, maskValue(k, v)]));
      const maskedRes = Object.fromEntries(Object.entries(entry.resHeaders || {}).map(([k, v]) => [k, maskValue(k, v)]));
      pre.textContent = JSON.stringify(
        {
          kind: entry.kind,
          method: entry.method,
          url: entry.url,
          status: entry.status,
          timeMs: entry.timeMs,
          note: entry.note,
          reqHeaders: maskedReq,
          resHeaders: maskedRes,
          reqBody: entry.reqBody ? String(entry.reqBody).slice(0, 4000) : '',
          resBody: entry.resBody ? String(entry.resBody).slice(0, 4000) : ''
        },
        null,
        2
      );
      const list = document.getElementById('captureEntriesList');
      const existing = list?.querySelector('[data-capture-detail]');
      existing?.remove();
      if (list) {
        pre.dataset.captureDetail = '1';
        list.prepend(pre);
      }
    }

    async function refreshStatus() {
      if (!isElectron()) return;
      const res = await invoke('pm:capture:list');
      if (Array.isArray(res?.entries)) {
        entries.length = 0;
        entries.push(...res.entries.slice(-500));
        renderEntries();
      }
    }

    btn.addEventListener('click', async () => {
      populateCollections();
      modal.classList.remove('hidden');
      if (!unsubEntry) {
        unsubEntry = subscribe('pm:capture:entry', (entry) => {
          entries.push(entry);
          if (entries.length > 500) entries.shift();
          renderEntries();
        });
      }
      await refreshStatus();
    });

    document.getElementById('btnCloseCaptureModal')?.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
    document.getElementById('captureFilterInput')?.addEventListener('input', renderEntries);

    document.getElementById('btnCaptureStart')?.addEventListener('click', async () => {
      if (!isElectron()) return;
      const res = await invoke('pm:capture:start', { port: Number(document.getElementById('capturePortInput')?.value || 8888), host: '127.0.0.1' });
      if (res?.ok) {
        document.getElementById('captureProxyUrl').textContent = `Proxy: ${res.url} (somente loopback)`;
        if (statusEl()) statusEl().textContent = `Proxy interceptor ativo em ${res.url}`;
      } else {
        if (statusEl()) statusEl().textContent = `Falha ao iniciar captura: ${res?.error?.message || res?.error || 'erro'}`;
      }
    });

    document.getElementById('btnCaptureStop')?.addEventListener('click', async () => {
      if (!isElectron()) return;
      await invoke('pm:capture:stop');
      document.getElementById('captureProxyUrl').textContent = '';
      if (statusEl()) statusEl().textContent = 'Proxy interceptor parado.';
    });

    document.getElementById('btnCaptureClear')?.addEventListener('click', async () => {
      if (!isElectron()) return;
      await invoke('pm:capture:clear');
      entries.length = 0;
      renderEntries();
    });
  }

  if (window.CDO?.hookBus) {
    window.CDO.hookBus.on('app:ready', initCaptureUI);
  } else {
    window.addEventListener('DOMContentLoaded', initCaptureUI);
  }
})();
