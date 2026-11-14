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

  function initFolderSyncUI() {
    const actions = document.getElementById('workspaceMenuSlot') || document.querySelector('.request-header-actions');
    if (!actions || document.getElementById('btnOpenSyncModal')) return;

    const btn = document.createElement('button');
    btn.id = 'btnOpenSyncModal';
    btn.type = 'button';
    btn.className = 'btn-secondary';
    btn.textContent = '🗂 Sync';
    btn.title = isElectron() ? 'Sincronizar Collection com pasta .ovo no disco' : 'Disponível apenas no app Electron';
    if (!isElectron()) btn.disabled = true;
    actions.appendChild(btn);

    const modalHtml = `
      <div id="folderSyncModal" class="modal-backdrop hidden">
        <div class="modal modal-large">
          <div class="modal-header">
            <h3>🗂 Live Folder Sync (.ovo)</h3>
            <button id="btnCloseSyncModal" class="btn-icon">✕</button>
          </div>
          <div class="modal-body">
            <div class="env-profile-config-card">
              <div class="pane-header" style="flex-wrap:wrap; gap:8px;">
                <label>Collection:</label>
                <select id="syncCollectionSelect" class="select-input" style="min-width:220px;"></select>
                <label>Pasta:</label>
                <input id="syncDirInput" type="text" class="text-input" style="flex:1; min-width:220px;" placeholder="C:\\projetos\\api-collection" />
                <button id="btnSyncPickFolder" class="btn-small">📂 Escolher</button>
              </div>
              <div class="chain-actions" style="margin-top:8px;">
                <button id="btnSyncEnable" class="btn-send" style="height:32px;">▶ Ativar Sync</button>
                <button id="btnSyncFlush" class="btn-small">💾 Flush p/ Disco</button>
                <button id="btnSyncDisable" class="btn-small btn-danger-ghost">■ Desativar</button>
                <button id="btnSyncStatus" class="btn-small">↻ Status</button>
              </div>
              <div style="font-size:12px; color:var(--text-secondary); margin-top:6px;">
                Um arquivo <code>.ovo</code> por request + <code>collection.ovo</code>. Variáveis secretas são exportadas sem valor. Edições externas na pasta atualizam a Collection.
              </div>
            </div>
            <div id="syncStatusBox" class="chain-box" style="margin-top:8px;">
              <div class="chain-box-title">Status</div>
              <div id="syncStatusText" class="badge">Sem sync ativo</div>
              <div id="syncStatusDetail" style="margin-top:6px; font-family:var(--font-mono); word-break:break-all;"></div>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = document.getElementById('folderSyncModal');
    const enabledSyncs = new Map();
    let flushTimer = null;
    let unsubChanged = null;
    let unsubConflict = null;

    function populateCollections() {
      const sel = document.getElementById('syncCollectionSelect');
      if (!sel) return;
      sel.innerHTML = '';
      for (const col of app()?.state?.collections || []) {
        const opt = document.createElement('option');
        opt.value = col.id;
        opt.textContent = col.name || col.id;
        sel.appendChild(opt);
      }
      const active = app()?.state?.collections?.find((c) => c.id === sel.value) || app()?.state?.collections?.[0];
      if (active) {
        sel.value = active.id;
        const dir = document.getElementById('syncDirInput');
        if (dir) dir.value = active.sync?.dirPath || '';
      }
    }

    function currentCollection() {
      const id = document.getElementById('syncCollectionSelect')?.value;
      return app()?.state?.collections?.find((c) => c.id === id) || null;
    }

    function renderStatus(status) {
      const text = document.getElementById('syncStatusText');
      const detail = document.getElementById('syncStatusDetail');
      if (!text || !detail) return;
      const active = Array.isArray(status?.activeSyncs) ? status.activeSyncs : [];
      text.textContent = active.length > 0 ? `${active.length} sync(s) ativo(s)` : 'Sem sync ativo';
      detail.textContent = active.length ? active.join(', ') : '';
    }

    async function refreshStatus() {
      if (!isElectron()) return;
      const res = await invoke('pm:sync:status');
      renderStatus(res || { activeSyncs: [] });
    }

    function scheduleFlush() {
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = setTimeout(async () => {
        for (const [collectionId, dirPath] of enabledSyncs.entries()) {
          await invoke('pm:sync:flush', { collectionId, dirPath });
        }
      }, 300);
      flushTimer.unref?.();
    }

    function upsertSyncedItem(payload) {
      const a = app();
      const col = a?.state?.collections?.find((c) => c.id === payload?.collectionId);
      const item = payload?.item;
      if (!col || !item) return;
      if (!item.id) item.id = `sync_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const idx = (col.items || []).findIndex((it) => it.id === item.id);
      if (idx >= 0) col.items[idx] = { ...col.items[idx], ...item };
      else col.items = [...(col.items || []), item];
      a.renderSidebar?.();
      if (statusEl()) statusEl().textContent = `Sync: item "${item.name || item.id}" atualizado do disco.`;
    }

    btn.addEventListener('click', async () => {
      populateCollections();
      modal.classList.remove('hidden');
      await refreshStatus();
      if (!unsubChanged) {
        unsubChanged = subscribe('pm:sync:changed', upsertSyncedItem);
        unsubConflict = subscribe('pm:sync:conflict', (payload) => {
          if (statusEl()) statusEl().textContent = `Sync: ${payload?.message || 'conflito/erro ao ler arquivo do disco'}`;
        });
      }
      if (window.CDO?.hookBus && !btn._syncHookBound) {
        btn._syncHookBound = true;
        window.CDO.hookBus.on('collection:changed', scheduleFlush);
      }
    });

    document.getElementById('btnCloseSyncModal')?.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });

    document.getElementById('syncCollectionSelect')?.addEventListener('change', () => {
      const col = currentCollection();
      const dir = document.getElementById('syncDirInput');
      if (dir) dir.value = col?.sync?.dirPath || '';
    });

    document.getElementById('btnSyncPickFolder')?.addEventListener('click', async () => {
      if (!isElectron()) return;
      const res = await invoke('pm:sync:pickFolder');
      if (res?.ok && res.dirPath) {
        document.getElementById('syncDirInput').value = res.dirPath;
      }
    });

    document.getElementById('btnSyncEnable')?.addEventListener('click', async () => {
      if (!isElectron()) return;
      const col = currentCollection();
      const dirPath = document.getElementById('syncDirInput')?.value?.trim();
      if (!col || !dirPath) {
        if (statusEl()) statusEl().textContent = 'Selecione Collection e pasta de destino.';
        return;
      }
      const res = await invoke('pm:sync:enable', { collectionId: col.id, dirPath, format: 'ovo' });
      if (res?.ok) {
        col.sync = { enabled: true, dirPath, format: 'ovo', lastSyncAt: new Date().toISOString() };
        enabledSyncs.set(col.id, dirPath);
        await app()?.persistStore?.('collections');
        await refreshStatus();
        if (statusEl()) statusEl().textContent = `Sync ativo para "${col.name}" em ${dirPath}`;
      } else {
        if (statusEl()) statusEl().textContent = `Falha ao ativar sync: ${res?.error?.message || res?.error || 'erro'}`;
      }
    });

    document.getElementById('btnSyncFlush')?.addEventListener('click', async () => {
      if (!isElectron()) return;
      const col = currentCollection();
      const dirPath = document.getElementById('syncDirInput')?.value?.trim() || col?.sync?.dirPath;
      if (!col || !dirPath) return;
      const res = await invoke('pm:sync:flush', { collectionId: col.id, dirPath });
      if (statusEl()) statusEl().textContent = res?.ok ? `Flush concluído para "${col.name}".` : `Falha no flush: ${res?.error?.message || 'erro'}`;
    });

    document.getElementById('btnSyncDisable')?.addEventListener('click', async () => {
      if (!isElectron()) return;
      const col = currentCollection();
      if (!col) return;
      await invoke('pm:sync:disable', { collectionId: col.id });
      enabledSyncs.delete(col.id);
      if (col.sync) col.sync.enabled = false;
      await app()?.persistStore?.('collections');
      await refreshStatus();
      if (statusEl()) statusEl().textContent = `Sync desativado para "${col.name}".`;
    });

    document.getElementById('btnSyncStatus')?.addEventListener('click', refreshStatus);
  }

  if (window.CDO?.hookBus) {
    window.CDO.hookBus.on('app:ready', initFolderSyncUI);
  } else {
    window.addEventListener('DOMContentLoaded', initFolderSyncUI);
  }
})();
