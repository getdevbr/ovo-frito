
/* Renderização da Sidebar (Collections c/ Pastas, Runner e Duplicação) */
function renderSidebarCore() {
  const envSelect = document.getElementById('envSelect');
  envSelect.innerHTML = `<option value="">No Environment</option>`;
  state.environments.forEach((env) => {
    const meta = getEnvProfileMeta(env);
    const opt = document.createElement('option');
    opt.value = env.id;
    opt.textContent = meta.label ? `${meta.icon} [${meta.label}] ${env.name}` : `${meta.icon} ${env.name}`;
    if (env.id === state.settings.activeEnvironmentId) opt.selected = true;
    envSelect.appendChild(opt);
  });
  applyActiveEnvProfileContour();

  const filterTerm = (state.sidebarFilter || '').trim().toLowerCase();

  // Collections
  const colList = document.getElementById('collectionsList');
  colList.innerHTML = '';

  // U-05: seções Favoritos e Recentes no topo (somente sem filtro ativo)
  if (!filterTerm && window.CDO?.favorites) {
    const fav = window.CDO.favorites;
    const renderQuickRow = (id, icon) => {
      const found = fav.findRequest(id);
      if (!found) return null;
      const { item, collectionId } = found;
      const row = document.createElement('div');
      row.className = 'tree-item';
      row.style.cursor = 'pointer';
      row.innerHTML = `<span class="method-badge method-${item.method || 'GET'}">${item.method || 'GET'}</span> <span style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${icon} ${escapeHtml(item.name || item.url || '')}</span>`;
      row.addEventListener('click', () => openRequestInTab(item, collectionId));
      return row;
    };
    const favIds = state.settings.favorites || [];
    const recIds = (state.settings.recents || []).filter((id) => !favIds.includes(id));
    if (favIds.length || recIds.length) {
      const mkSection = (title, ids, icon) => {
        const sec = document.createElement('div');
        sec.className = 'collection-group';
        const head = document.createElement('div');
        head.className = 'collection-header';
        head.innerHTML = `<span style="font-size:11px;font-weight:600;color:var(--text-secondary);padding:4px 2px;">${title}</span>`;
        sec.appendChild(head);
        const wrap = document.createElement('div');
        ids.slice(0, 10).forEach((id) => {
          const row = renderQuickRow(id, icon);
          if (row) wrap.appendChild(row);
        });
        sec.appendChild(wrap);
        return sec;
      };
      if (favIds.length) colList.appendChild(mkSection('⭐ Favoritos', favIds, '★'));
      if (recIds.length) colList.appendChild(mkSection('🕘 Recentes', recIds, '•'));
    }
  }

  // U-01: empty state de onboarding quando não há collections
  if (!filterTerm && (!state.collections || state.collections.length === 0)) {
    const welcome = document.createElement('div');
    welcome.className = 'empty-hint';
    welcome.style.cssText = 'padding:18px 10px;text-align:center;';
    welcome.innerHTML = `
      <div style="font-size:22px;margin-bottom:6px;">🍳 Bem-vindo ao Ovo Frito</div>
      <div style="margin-bottom:10px;">Cliente HTTP local-first. Comece rápido:</div>
      <div style="display:flex;flex-direction:column;gap:6px;align-items:center;">
        <button class="btn-small" id="onboardNewCollection">+ Criar Collection</button>
        <button class="btn-small" id="onboardImport">📥 Importar (.ovo, cURL, OpenAPI)</button>
        <button class="btn-small" id="onboardBlankTab">＋ Nova aba em branco</button>
      </div>
      <div style="margin-top:10px;font-size:11px;opacity:.7;">Dica: pressione Ctrl+K para a paleta de comandos.</div>`;
    colList.appendChild(welcome);
    welcome.querySelector('#onboardNewCollection')?.addEventListener('click', () => document.getElementById('btnNewCollection')?.click());
    welcome.querySelector('#onboardImport')?.addEventListener('click', () => document.getElementById('btnOpenImportModal')?.click());
    welcome.querySelector('#onboardBlankTab')?.addEventListener('click', () => { if (typeof createBlankTab === 'function') { const t = createBlankTab(); state.tabs.push(t); state.activeTabId = t.id; saveSessionState(); renderAll(); } });
  }

  state.collections.forEach((col, colIdx) => {
    const filteredItems = (col.items || []).filter((it) => {
      if (!filterTerm) return true;
      return (
        (it.name || '').toLowerCase().includes(filterTerm) ||
        (it.folder || '').toLowerCase().includes(filterTerm) ||
        (it.url || '').toLowerCase().includes(filterTerm) ||
        (it.method || '').toLowerCase().includes(filterTerm)
      );
    });

    if (filterTerm && filteredItems.length === 0 && !(col.name || '').toLowerCase().includes(filterTerm)) {
      return;
    }

    const group = document.createElement('div');
    group.className = 'collection-group';
    group.dataset.colId = col.id;
    group.dataset.folderPath = '';

    const header = document.createElement('div');
    header.className = 'collection-header';
    const isCollapsed = !!state.collapsedCollections[col.id];

    // Nome da Collection (ou input inline quando está renomeando)
    if (state.renamingCollectionId === col.id) {
      const renameInput = document.createElement('input');
      renameInput.type = 'text';
      renameInput.className = 'inline-rename-input';
      renameInput.value = col.name || '';
      renameInput.addEventListener('click', (e) => e.stopPropagation());
      const finishRename = async (save) => {
        if (state.renamingCollectionId !== col.id) return;
        if (save && renameInput.value.trim()) {
          col.name = renameInput.value.trim();
          await persistStore('collections');
        }
        state.renamingCollectionId = null;
        renderSidebar();
      };
      renameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') finishRename(true);
        if (e.key === 'Escape') finishRename(false);
      });
      renameInput.addEventListener('blur', () => finishRename(true));
      header.appendChild(renameInput);
      setTimeout(() => {
        renameInput.focus();
        renameInput.select();
      }, 10);
    } else {
      const titleSpan = document.createElement('span');
      titleSpan.style.flex = '1';
      titleSpan.style.overflow = 'hidden';
      titleSpan.style.textOverflow = 'ellipsis';
      titleSpan.style.whiteSpace = 'nowrap';
      titleSpan.title = 'Clique para expandir/recolher • Duplo-clique para renomear';
      titleSpan.textContent = `${isCollapsed ? '📁' : '📂'} ${col.name} (${filteredItems.length})`;
      titleSpan.addEventListener('click', () => {
        state.collapsedCollections[col.id] = !state.collapsedCollections[col.id];
        renderSidebar();
      });
      titleSpan.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        state.renamingCollectionId = col.id;
        renderSidebar();
      });
      header.appendChild(titleSpan);
    }

    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'collection-header-actions';

    // Botão + Req (Criar nova request diretamente nesta Collection)
    const addReqBtn = document.createElement('button');
    addReqBtn.className = 'btn-add-req-inline';
    addReqBtn.textContent = '+ Req';
    addReqBtn.title = 'Criar nova Request nesta Collection';
    addReqBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      state.collapsedCollections[col.id] = false;
      if (!Array.isArray(col.items)) col.items = [];
      const newReqItem = {
        id: uid('req'),
        name: `Nova Request ${(col.items.length || 0) + 1}`,
        folder: '',
        method: 'GET',
        url: '{{base_url}}/posts',
        params: [],
        headers: [{ key: 'Accept', value: 'application/json', enabled: true }],
        auth: {
          type: col.auth?.type && col.auth.type !== 'none' ? 'inherit' : 'none',
          token: '',
          username: '',
          password: '',
          keyName: '',
          keyValue: '',
          addTo: 'header'
        },
        body: { mode: 'none', raw: '', graphqlQuery: '', graphqlVars: '{\n  \n}', urlencoded: [], formdata: [] },
        assertions: [{ source: 'status', operator: '==', target: '200', enabled: true }],
        captures: [],
        preRequestScript: '',
        postResponseScript: ''
      };
      col.items.push(newReqItem);
      await persistStore('collections');
      state.renamingRequestId = newReqItem.id;
      openRequestInTab(newReqItem, col.id);
    });

    // Botão Renomear Collection
    const renColBtn = document.createElement('button');
    renColBtn.className = 'tree-item-delete';
    renColBtn.textContent = '✏️';
    renColBtn.title = 'Renomear Collection';
    renColBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.renamingCollectionId = col.id;
      renderSidebar();
    });

    const runColBtn = document.createElement('button');
    runColBtn.className = 'tree-item-delete';
    runColBtn.textContent = '▶';
    runColBtn.title = 'Executar Collection em Sequência (Collection Runner)';
    runColBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      runCollectionSequentially(col);
    });

    const expOvoColBtn = document.createElement('button');
    expOvoColBtn.className = 'btn-add-req-inline';
    expOvoColBtn.textContent = '🥚 .ovo';
    expOvoColBtn.title = 'Exportar Collection no formato nativo .ovo (Ovo Frito)';
    expOvoColBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      exportCollectionAsOvo(col);
    });

    const expColBtn = document.createElement('button');
    expColBtn.className = 'tree-item-delete';
    expColBtn.textContent = '📤';
    expColBtn.title = 'Exportar como Postman Collection v2.1 (.json)';
    expColBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      exportCollectionAsPostmanV21(col);
    });

    const delColBtn = document.createElement('button');
    delColBtn.className = 'tree-item-delete';
    delColBtn.textContent = '🗑';
    delColBtn.title = 'Excluir Collection';
    delColBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (window.CDO?.trash?.remove) {
        await window.CDO.trash.remove({
          type: 'collection',
          item: col,
          origin: { index: colIdx },
          confirm: async ({ count }) => window.CDO.dialog.confirm({
            title: 'Excluir Collection',
            message: `Excluir a Collection "${col.name}" e suas ${count} requisições?`,
            confirmLabel: 'Excluir',
            danger: true
          })
        });
        return;
      }
      state.collections.splice(colIdx, 1);
      await persistStore('collections');
      renderSidebar();
    });

    const cfgColBtn = document.createElement('button');
    cfgColBtn.className = 'tree-item-delete';
    cfgColBtn.textContent = '⚙';
    cfgColBtn.title = 'Configurar Pastas e Variáveis da Collection';
    cfgColBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openCollectionConfigModal(col);
    });

    actionsWrap.appendChild(addReqBtn);
    actionsWrap.appendChild(expOvoColBtn);
    actionsWrap.appendChild(cfgColBtn);
    actionsWrap.appendChild(renColBtn);
    actionsWrap.appendChild(runColBtn);
    actionsWrap.appendChild(expColBtn);
    actionsWrap.appendChild(delColBtn);
    header.appendChild(actionsWrap);

    const itemsWrap = document.createElement('div');
    itemsWrap.className = `collection-items ${isCollapsed ? 'hidden' : ''}`;
    itemsWrap.dataset.colId = col.id;
    itemsWrap.dataset.folderPath = '';

    let lastFolder = null;
    filteredItems.forEach((item) => {
      if (!item.id) item.id = uid('req');
      const folderName = (item.folder || '').trim();
      if (folderName && folderName !== lastFolder) {
        lastFolder = folderName;
        const fLabel = document.createElement('div');
        fLabel.className = 'folder-label';
        fLabel.dataset.colId = col.id;
        fLabel.dataset.folderPath = folderName;
        fLabel.textContent = `📁 ${folderName}`;
        itemsWrap.appendChild(fLabel);
      }

      const realIdx = col.items.indexOf(item);
      const row = document.createElement('div');
      row.className = 'tree-item';
      row.dataset.reqId = item.id;
      row.dataset.folderPath = folderName;
      row.addEventListener('click', () => {
        openRequestInTab(item, col.id);
      });

      const badge = document.createElement('span');
      badge.className = `method-badge method-${item.method || 'GET'}`;
      badge.textContent = item.method || 'GET';
      row.appendChild(badge);

      if (state.renamingRequestId === item.id) {
        const reqRenameInput = document.createElement('input');
        reqRenameInput.type = 'text';
        reqRenameInput.className = 'inline-rename-input';
        reqRenameInput.value = item.name || item.url || '';
        reqRenameInput.addEventListener('click', (e) => e.stopPropagation());
        const finishReqRename = async (save) => {
          if (state.renamingRequestId !== item.id) return;
          if (save && reqRenameInput.value.trim()) {
            item.name = reqRenameInput.value.trim();
            // Sincroniza também na aba aberta se for a mesma request
            const linkedTab = state.tabs.find((t) => t.collectionItemId === item.id);
            if (linkedTab) linkedTab.name = item.name;
            await persistStore('collections');
          }
          state.renamingRequestId = null;
          renderAll();
        };
        reqRenameInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') finishReqRename(true);
          if (e.key === 'Escape') finishReqRename(false);
        });
        reqRenameInput.addEventListener('blur', () => finishReqRename(true));
        row.appendChild(reqRenameInput);
        setTimeout(() => {
          reqRenameInput.focus();
          reqRenameInput.select();
        }, 10);
      } else {
        const name = document.createElement('span');
        name.className = 'tree-item-title';
        name.title = 'Clique para abrir • Duplo-clique para renomear';
        const reqHistCount = Array.isArray(item.history) && item.history.length > 0 ? ` (${item.history.length})` : '';
        name.textContent = `${item.name || item.url}${reqHistCount}`;
        name.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          state.renamingRequestId = item.id;
          renderSidebar();
        });
        row.appendChild(name);
      }

      const expReqOvoBtn = document.createElement('button');
      expReqOvoBtn.className = 'tree-item-delete';
      expReqOvoBtn.textContent = '🥚';
      expReqOvoBtn.title = 'Exportar esta Requisição como .ovo';
      expReqOvoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        exportRequestAsOvo(item);
      });

      const renReqBtn = document.createElement('button');
      renReqBtn.className = 'tree-item-delete';
      renReqBtn.textContent = '✏️';
      renReqBtn.title = 'Renomear Requisição';
      renReqBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.renamingRequestId = item.id;
        renderSidebar();
      });

      const dupBtn = document.createElement('button');
      dupBtn.className = 'tree-item-delete';
      dupBtn.textContent = '⧉';
      dupBtn.title = 'Duplicar Requisição';
      dupBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const copy = structuredClone(item);
        copy.id = uid('req');
        copy.name = `${item.name || 'Req'} (Cópia)`;
        col.items.splice(realIdx + 1, 0, copy);
        await persistStore('collections');
        renderSidebar();
      });

      const favBtn = document.createElement('button');
      favBtn.className = 'tree-item-delete';
      const isFav = window.CDO?.favorites?.isFavorite?.(item.id);
      favBtn.textContent = isFav ? '★' : '☆';
      favBtn.title = isFav ? 'Remover dos Favoritos' : 'Favoritar';
      favBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await window.CDO?.favorites?.toggleFavorite?.(item.id);
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'tree-item-delete';
      delBtn.textContent = '✕';
      delBtn.title = 'Remover da Collection';
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (window.CDO?.trash?.remove) {
          await window.CDO.trash.remove({
            type: 'request',
            item,
            origin: { collectionId: col.id, index: realIdx }
          });
          return;
        }
        if (realIdx !== -1) col.items.splice(realIdx, 1);
        await persistStore('collections');
        renderSidebar();
      });

      row.appendChild(expReqOvoBtn);
      row.appendChild(renReqBtn);
      row.appendChild(dupBtn);
      row.appendChild(favBtn);
      row.appendChild(delBtn);
      itemsWrap.appendChild(row);
    });

    group.appendChild(header);
    group.appendChild(itemsWrap);
    colList.appendChild(group);
  });

  // Environments List na Sidebar
  const envList = document.getElementById('environmentsList');
  envList.innerHTML = '';
  state.environments.forEach((env) => {
    const meta = getEnvProfileMeta(env);
    const row = document.createElement('div');
    row.className = 'tree-item';
    if (meta.hasContour && meta.borderColor) {
      row.style.borderLeft = `3px solid ${meta.borderColor}`;
    }
    row.addEventListener('click', () => {
      state.settings.activeEnvironmentId = env.id;
      persistStore('settings');
      renderAll();
      openEnvModal(env.id);
    });

    const icon = document.createElement('span');
    icon.textContent = env.id === state.settings.activeEnvironmentId ? meta.icon : '⚪';
    row.appendChild(icon);

    if (meta.label) {
      const pill = document.createElement('span');
      pill.className = 'env-tree-profile-pill';
      pill.textContent = meta.label;
      if (meta.hasContour && meta.borderColor) {
        pill.style.borderColor = meta.borderColor;
        pill.style.color = meta.borderColor;
      }
      row.appendChild(pill);
    }

    const name = document.createElement('span');
    name.className = 'tree-item-title';
    name.textContent = `${env.name} (${(env.variables || []).length} vars)`;

    row.appendChild(name);
    envList.appendChild(row);
  });

  // History List na Sidebar (se presente)
  const histList = document.getElementById('historyList');
  const histBanner = document.getElementById('sidebarHistoryReqTitle');
  if (histList) {
    histList.innerHTML = '';
    const activeTab = getActiveTab();
    const reqHistory = Array.isArray(activeTab?.history) ? activeTab.history : [];

    if (histBanner) {
      histBanner.textContent = activeTab
        ? `📌 ${activeTab.name || activeTab.url || 'Sem título'} (${reqHistory.length} execuções)`
        : 'Nenhuma requisição selecionada';
    }

    if (reqHistory.length === 0) {
      histList.innerHTML = `<div class="empty-hint">Sem execuções registradas para esta requisição ainda.</div>`;
    } else {
      reqHistory.forEach((h, hIdx) => {
        const row = document.createElement('div');
        row.className = 'tree-item';
        row.title = 'Clique para carregar esta execução (resposta e parâmetros) na requisição ativa';
        row.addEventListener('click', async () => {
          if (!activeTab) return;
          if (h.response) activeTab.response = structuredClone(h.response);
          if (h.testResults) activeTab.testResults = structuredClone(h.testResults);
          if (h.requestSent) activeTab.lastSentInspector = structuredClone(h.requestSent);
          renderAll();
          document.getElementById('statusMessage').textContent = `Carregada execução de ${formatHistoryTimestamp(h.timestamp)} (${h.status}).`;
        });

        const isOk = h.status >= 200 && h.status < 300;
        const statusBadge = document.createElement('span');
        statusBadge.className = isOk ? 'test-badge-pass' : 'test-badge-fail';
        statusBadge.textContent = h.status || 'ERR';

        const name = document.createElement('span');
        name.className = 'tree-item-title';
        name.textContent = `${formatHistoryTimestamp(h.timestamp)} • ${h.timeMs || 0}ms`;

        const delBtn = document.createElement('button');
        delBtn.className = 'tree-item-delete';
        delBtn.textContent = '✕';
        delBtn.title = 'Remover do histórico desta requisição';
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          activeTab.history.splice(hIdx, 1);
          await syncTabBackToCollectionItem(activeTab);
          await saveSessionState();
          renderAll();
        });

        row.appendChild(statusBadge);
        row.appendChild(name);
        row.appendChild(delBtn);
        histList.appendChild(row);
      });
    }
  }
}


function renderSidebar() {
  renderSidebarCore();
  emitAppHook('sidebar:rendered', {
    container: document.getElementById('collectionsList')
  });
}


function openRequestInTab(item, collectionId = null) {
  if (item?.id) window.CDO?.favorites?.touchRecent?.(item.id);
  // Se já houver uma aba aberta para este item da Collection, foca nela
  if (item.id && collectionId) {
    const existingTab = state.tabs.find((t) => t.collectionItemId === item.id && t.collectionId === collectionId);
    if (existingTab) {
      state.activeTabId = existingTab.id;
      renderAll();
      emitAppHook('tab:activated', { tabId: existingTab.id });
      return;
    }
  }

  const newTab = createBlankTab({
    collectionId,
    collectionItemId: item.id || null,
    name: item.name || item.url,
    folder: item.folder || '',
    method: item.method || 'GET',
    url: item.url || '',
    params: item.params || [],
    headers: item.headers || [],
    auth: item.auth || { type: 'none', token: '', username: '', password: '', keyName: '', keyValue: '', addTo: 'header' },
    body: item.body || { mode: 'none', raw: '', graphqlQuery: '', graphqlVars: '{\n  \n}', urlencoded: [], formdata: [] },
    assertions: item.assertions || [{ source: 'status', operator: '==', target: '200', enabled: true }],
    captures: item.captures || [],
    preDbQueries: Array.isArray(item.preDbQueries) ? item.preDbQueries : [],
    postDbQueries: Array.isArray(item.postDbQueries) ? item.postDbQueries : [],
    preRequestScript: item.preRequestScript || '',
    postResponseScript: item.postResponseScript || '',
    history: Array.isArray(item.history) ? item.history : [],
    response: item.history?.[0]?.response || null,
    testResults: item.history?.[0]?.testResults || null
  });
  state.tabs.push(newTab);
  state.activeTabId = newTab.id;
  saveSessionState();
  renderAll();
  emitAppHook('tab:activated', { tabId: newTab.id });
}


async function syncTabBackToCollectionItem(tab, { includeHistory = true } = {}) {
  if (!tab || !tab.collectionId || !tab.collectionItemId) return;
  const col = state.collections.find((c) => c.id === tab.collectionId);
  if (!col || !Array.isArray(col.items)) return;
  const item = col.items.find((it) => it.id === tab.collectionItemId);
  if (!item) return;

  item.name = tab.name;
  item.method = tab.method;
  item.url = tab.url;
  item.params = structuredClone(tab.params);
  item.headers = structuredClone(tab.headers);
  item.auth = structuredClone(tab.auth);
  item.body = structuredClone(tab.body);
  item.assertions = structuredClone(tab.assertions);
  item.captures = structuredClone(tab.captures);
  item.preDbQueries = Array.isArray(tab.preDbQueries) ? structuredClone(tab.preDbQueries) : [];
  item.postDbQueries = Array.isArray(tab.postDbQueries) ? structuredClone(tab.postDbQueries) : [];
  item.preRequestScript = tab.preRequestScript || '';
  item.postResponseScript = tab.postResponseScript || '';
  if (includeHistory) {
    item.history = Array.isArray(tab.history) ? structuredClone(tab.history) : [];
  }
  await schedulePersistStore('collections');
}

(function (root) {
  const api = {
    renderSidebarCore,
    renderSidebar,
    openRequestInTab,
    syncTabBackToCollectionItem
  };
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.core = root.CDO.core || {};
    root.CDO.core.sidebar = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

