
function renderAll() {
  renderSidebar();
  renderTabsBar();
  renderActiveRequest();
  applyActiveEnvProfileContour();
  renderNetworkStatusIndicators();
}


function getLayoutPrefs() {
  let savedLocal = null;
  try {
    savedLocal = JSON.parse(localStorage.getItem('ovofrito_layout_prefs') || 'null');
  } catch {}
  const base = {
    sidebarWidth: 325,
    sidebarCollapsed: false,
    sidebarPosition: 'left', // 'left' (◧) ou 'right' (◨)
    splitDirection: 'vertical', // 'vertical' (⬍), 'vertical-reverse' (⬆), 'horizontal' (⬌), 'horizontal-reverse' (⬅)
    requestPanePct: 45,
    focusMode: 'none' // 'none', 'request', 'response'
  };
  return {
    ...base,
    ...(savedLocal || {}),
    ...(state.settings?.layout || {})
  };
}


async function saveLayoutPrefs(layout) {
  state.settings.layout = layout;
  try {
    localStorage.setItem('ovofrito_layout_prefs', JSON.stringify(layout));
  } catch {}
  await persistStore('settings');
}


function applyLayoutState(layout) {
  const workspace = document.getElementById('workspaceContainer');
  const sidebar = document.getElementById('appSidebar');
  const splitContainer = document.getElementById('workbenchSplitContainer');
  const reqPane = document.getElementById('requestEditorPane');
  const btnSidebar = document.getElementById('btnToggleSidebar');
  const btnSplit = document.getElementById('btnToggleSplitLayout');

  if (workspace) {
    workspace.classList.toggle('sidebar-right', layout.sidebarPosition === 'right');
  }

  if (sidebar) {
    if (layout.sidebarCollapsed) {
      sidebar.classList.add('collapsed');
      if (btnSidebar) btnSidebar.textContent = '⬜ Menu';
    } else {
      sidebar.classList.remove('collapsed');
      const w = Math.max(180, Math.min(680, Number(layout.sidebarWidth) || 325));
      sidebar.style.width = `${w}px`;
      if (btnSidebar) btnSidebar.textContent = layout.sidebarPosition === 'right' ? '◨ Menu' : '◧ Menu';
    }
  }

  if (splitContainer && reqPane) {
    const pct = Math.max(18, Math.min(82, Number(layout.requestPanePct) || 45));
    const dir = layout.splitDirection || 'vertical';
    splitContainer.classList.remove('split-vertical-reverse', 'split-horizontal', 'split-horizontal-reverse', 'focus-request', 'focus-response');

    if (layout.focusMode === 'request') {
      splitContainer.classList.add('focus-request');
    } else if (layout.focusMode === 'response') {
      splitContainer.classList.add('focus-response');
    }

    if (dir === 'horizontal' || dir === 'horizontal-reverse') {
      splitContainer.classList.add(dir === 'horizontal-reverse' ? 'split-horizontal-reverse' : 'split-horizontal');
      reqPane.style.width = `${pct}%`;
      reqPane.style.height = '100%';
      if (btnSplit) btnSplit.textContent = dir === 'horizontal-reverse' ? '⬅ Layout' : '⬌ Layout';
    } else {
      if (dir === 'vertical-reverse') {
        splitContainer.classList.add('split-vertical-reverse');
      }
      reqPane.style.height = `${pct}%`;
      reqPane.style.width = '100%';
      if (btnSplit) btnSplit.textContent = dir === 'vertical-reverse' ? '⬆ Layout' : '⬍ Layout';
    }
  }

  // Atualiza destaque visual no menu de Disposição
  document.querySelectorAll('[data-disp-sidebar]').forEach((b) => {
    const val = b.dataset.dispSidebar;
    if (val === 'toggle') {
      b.classList.toggle('active-disp', !!layout.sidebarCollapsed);
    } else {
      b.classList.toggle('active-disp', !layout.sidebarCollapsed && (layout.sidebarPosition || 'left') === val);
    }
  });

  document.querySelectorAll('[data-disp-split]').forEach((b) => {
    b.classList.toggle('active-disp', (layout.splitDirection || 'vertical') === b.dataset.dispSplit);
  });

  document.querySelectorAll('[data-disp-focus]').forEach((b) => {
    const val = b.dataset.dispFocus;
    if (val === 'equal') {
      b.classList.toggle('active-disp', (!layout.focusMode || layout.focusMode === 'none') && Number(layout.requestPanePct) === 50);
    } else {
      b.classList.toggle('active-disp', layout.focusMode === val);
    }
  });
}


function initResizersAndLayout() {
  const layout = getLayoutPrefs();
  state.settings.layout = layout;
  applyLayoutState(layout);

  const sidebar = document.getElementById('appSidebar');
  const sidebarResizer = document.getElementById('sidebarResizer');
  const splitContainer = document.getElementById('workbenchSplitContainer');
  const workbenchResizer = document.getElementById('workbenchResizer');
  const btnToggleSidebar = document.getElementById('btnToggleSidebar');
  const btnToggleSplitLayout = document.getElementById('btnToggleSplitLayout');
  const btnOpenDispositionMenu = document.getElementById('btnOpenDispositionMenu');
  const dispositionPopover = document.getElementById('dispositionPopover');

  // Menu Popover de Disposição das Janelas
  if (btnOpenDispositionMenu && dispositionPopover) {
    btnOpenDispositionMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      dispositionPopover.classList.toggle('hidden');
    });

    window.addEventListener('click', (e) => {
      if (!e.target.closest('.disposition-wrap')) {
        dispositionPopover.classList.add('hidden');
      }
    });
  }

  document.querySelectorAll('[data-disp-sidebar]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.dispSidebar;
      if (val === 'toggle') {
        layout.sidebarCollapsed = !layout.sidebarCollapsed;
      } else {
        layout.sidebarPosition = val;
        layout.sidebarCollapsed = false;
      }
      applyLayoutState(layout);
      saveLayoutPrefs(layout);
    });
  });

  document.querySelectorAll('[data-disp-split]').forEach((btn) => {
    btn.addEventListener('click', () => {
      layout.splitDirection = btn.dataset.dispSplit;
      layout.focusMode = 'none';
      applyLayoutState(layout);
      saveLayoutPrefs(layout);
    });
  });

  document.querySelectorAll('[data-disp-focus]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.dispFocus;
      if (val === 'equal') {
        layout.focusMode = 'none';
        layout.requestPanePct = 50;
      } else {
        layout.focusMode = layout.focusMode === val ? 'none' : val;
      }
      applyLayoutState(layout);
      saveLayoutPrefs(layout);
    });
  });

  // Função auxiliar para inverter a posição entre Request e Response
  function swapRequestResponsePanels() {
    layout.focusMode = 'none';
    const map = {
      vertical: 'vertical-reverse',
      'vertical-reverse': 'vertical',
      horizontal: 'horizontal-reverse',
      'horizontal-reverse': 'horizontal'
    };
    layout.splitDirection = map[layout.splitDirection] || 'vertical-reverse';
    applyLayoutState(layout);
    saveLayoutPrefs(layout);
    document.getElementById('statusMessage').textContent = 'Posição das janelas Request ⇄ Response invertida!';
  }

  ['btnSwapPanelsTop', 'btnSwapFromReq', 'btnSwapFromRes'].forEach((id) => {
    document.getElementById(id)?.addEventListener('click', swapRequestResponsePanels);
  });

  document.getElementById('btnMaxReqPane')?.addEventListener('click', () => {
    layout.focusMode = layout.focusMode === 'request' ? 'none' : 'request';
    applyLayoutState(layout);
    saveLayoutPrefs(layout);
  });

  document.getElementById('btnMaxResPane')?.addEventListener('click', () => {
    layout.focusMode = layout.focusMode === 'response' ? 'none' : 'response';
    applyLayoutState(layout);
    saveLayoutPrefs(layout);
  });

  // 1. Botão recolher/expandir Menu Lateral
  if (btnToggleSidebar) {
    btnToggleSidebar.addEventListener('click', () => {
      layout.sidebarCollapsed = !layout.sidebarCollapsed;
      applyLayoutState(layout);
      saveLayoutPrefs(layout);
    });
  }

  // 2. Arrastar barra do Menu Lateral (Sidebar)
  if (sidebarResizer && sidebar) {
    sidebarResizer.addEventListener('dblclick', () => {
      layout.sidebarCollapsed = !layout.sidebarCollapsed;
      applyLayoutState(layout);
      saveLayoutPrefs(layout);
    });

    sidebarResizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      sidebarResizer.classList.add('resizing');
      document.body.style.cursor = 'col-resize';

      const onMouseMove = (moveEv) => {
        const isRight = layout.sidebarPosition === 'right';
        const newWidth = isRight ? window.innerWidth - moveEv.clientX : moveEv.clientX;
        if (newWidth < 115) {
          layout.sidebarCollapsed = true;
        } else {
          layout.sidebarCollapsed = false;
          layout.sidebarWidth = Math.max(180, Math.min(680, newWidth));
        }
        applyLayoutState(layout);
      };

      const onMouseUp = () => {
        sidebarResizer.classList.remove('resizing');
        document.body.style.cursor = '';
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        saveLayoutPrefs(layout);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  }

  // 3. Alternar direção do Split Request/Response (cicla entre as 4 disposições)
  if (btnToggleSplitLayout) {
    btnToggleSplitLayout.addEventListener('click', () => {
      layout.focusMode = 'none';
      const order = ['vertical', 'horizontal', 'vertical-reverse', 'horizontal-reverse'];
      const idx = order.indexOf(layout.splitDirection || 'vertical');
      layout.splitDirection = order[(idx + 1) % order.length];
      applyLayoutState(layout);
      saveLayoutPrefs(layout);
    });
  }

  // 4. Arrastar divisória principal Request / Response
  if (workbenchResizer && splitContainer) {
    workbenchResizer.addEventListener('dblclick', () => {
      layout.requestPanePct = 50;
      applyLayoutState(layout);
      saveLayoutPrefs(layout);
    });

    workbenchResizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      workbenchResizer.classList.add('resizing');
      const dir = layout.splitDirection || 'vertical';
      const isHoriz = dir === 'horizontal' || dir === 'horizontal-reverse';
      const isRev = dir === 'vertical-reverse' || dir === 'horizontal-reverse';
      document.body.style.cursor = isHoriz ? 'col-resize' : 'row-resize';

      const onMouseMove = (moveEv) => {
        const rect = splitContainer.getBoundingClientRect();
        let rawPct = isHoriz
          ? ((moveEv.clientX - rect.left) / Math.max(1, rect.width)) * 100
          : ((moveEv.clientY - rect.top) / Math.max(1, rect.height)) * 100;
        if (isRev) rawPct = 100 - rawPct;
        layout.requestPanePct = Math.round(Math.max(18, Math.min(82, rawPct)));
        applyLayoutState(layout);
      };

      const onMouseUp = () => {
        workbenchResizer.classList.remove('resizing');
        document.body.style.cursor = '';
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        saveLayoutPrefs(layout);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  }

  // 5. Divisórias internas (.inner-resizer-vertical) em GraphQL, Tests & Captura e Scripts
  document.querySelectorAll('.inner-resizer-vertical').forEach((handle) => {
    const parentSplit = handle.parentElement;
    if (!parentSplit) return;
    const cols = parentSplit.querySelectorAll(':scope > .tests-col');
    if (cols.length < 2) return;
    const leftCol = cols[0];
    const rightCol = cols[1];

    handle.addEventListener('dblclick', () => {
      leftCol.style.flex = '1 1 50%';
      rightCol.style.flex = '1 1 50%';
    });

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      handle.classList.add('resizing');
      document.body.style.cursor = 'col-resize';

      const onMouseMove = (moveEv) => {
        const rect = parentSplit.getBoundingClientRect();
        const leftPct = Math.max(20, Math.min(80, ((moveEv.clientX - rect.left) / Math.max(1, rect.width)) * 100));
        leftCol.style.flex = `0 0 calc(${leftPct}% - 8px)`;
        rightCol.style.flex = `1 1 calc(${100 - leftPct}% - 8px)`;
      };

      const onMouseUp = () => {
        handle.classList.remove('resizing');
        document.body.style.cursor = '';
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  });

  // 6. Janelas Modais arrastáveis pelo cabeçalho (.modal-header)
  document.querySelectorAll('.modal').forEach((modal) => {
    const header = modal.querySelector('.modal-header');
    if (!header) return;
    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('button, input, select')) return;
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const origLeft = parseFloat(modal.style.left || '0') || 0;
      const origTop = parseFloat(modal.style.top || '0') || 0;

      const onMouseMove = (moveEv) => {
        modal.style.left = `${origLeft + (moveEv.clientX - startX)}px`;
        modal.style.top = `${origTop + (moveEv.clientY - startY)}px`;
      };

      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  });
}


/* Inicialização e Eventos */
const UI_MENU_SLOTS = ['workspaceMenuSlot', 'toolsMenuSlot', 'reqMoreMenuSlot', 'resGenerateMenuSlot'];


const UI_MENU_SLOT_BY_ID = {
  btnOpenImportModal: 'workspaceMenuSlot',
  btnOpenSyncModal: 'workspaceMenuSlot',
  btnOpenApiDocsModal: 'workspaceMenuSlot',
  btnOpenDevToolboxModal: 'toolsMenuSlot',
  btnOpenVaultModal: 'toolsMenuSlot',
  btnOpenMockModal: 'toolsMenuSlot',
  btnOpenCaptureModal: 'toolsMenuSlot',
  btnOpenWsModal: 'toolsMenuSlot',
  btnOpenSseModal: 'toolsMenuSlot',
  btnOpenCompareProfileModal: 'reqMoreMenuSlot',
  btnOpenLoadTestModal: 'reqMoreMenuSlot',
  btnOpenGqlModal: 'reqMoreMenuSlot',
  btnOpenTypeGenModal: 'resGenerateMenuSlot',
  btnGenerateContract: 'resGenerateMenuSlot'
};


const UI_MENU_FALLBACK_HOSTS = [
  ['.request-header-actions', 'reqMoreMenuSlot'],
  ['.topbar-actions', 'toolsMenuSlot'],
  ['.topbar-brand', 'workspaceMenuSlot'],
  ['.res-body-toolbar .chain-actions', 'resGenerateMenuSlot']
];


function uiMenuSlotForButton(btn) {
  if (UI_MENU_SLOT_BY_ID[btn.id]) return UI_MENU_SLOT_BY_ID[btn.id];
  for (const [hostSel, slotId] of UI_MENU_FALLBACK_HOSTS) {
    if (btn.closest(hostSel)) return slotId;
  }
  return null;
}


function relocateUiMenuButtons(root) {
  if (!root || root.nodeType !== 1) return;
  const buttons = [];
  if (root.matches && root.matches('button[id]')) buttons.push(root);
  if (root.querySelectorAll) buttons.push(...root.querySelectorAll('button[id]'));
  buttons.forEach((btn) => {
    if (btn.closest('.cdo-dropdown')) return;
    const slotId = uiMenuSlotForButton(btn);
    if (!slotId) return;
    const slot = document.getElementById(slotId);
    if (slot && btn.parentElement !== slot) slot.appendChild(btn);
  });
}


function initUiDropdownMenus() {
  document.querySelectorAll('[data-dropdown-toggle]').forEach((trigger) => {
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const slot = document.getElementById(trigger.dataset.dropdownToggle);
      if (!slot) return;
      const willOpen = slot.classList.contains('hidden');
      UI_MENU_SLOTS.forEach((id) => document.getElementById(id)?.classList.add('hidden'));
      if (willOpen) slot.classList.remove('hidden');
    });
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.cdo-dropdown')) {
      UI_MENU_SLOTS.forEach((id) => document.getElementById(id)?.classList.add('hidden'));
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      UI_MENU_SLOTS.forEach((id) => document.getElementById(id)?.classList.add('hidden'));
    }
  });

  document.addEventListener('click', (e) => {
    const item = e.target.closest('.cdo-menu-popover button');
    if (item) item.closest('.cdo-menu-popover')?.classList.add('hidden');
  });

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((m) => m.addedNodes.forEach(relocateUiMenuButtons));
  });
  observer.observe(document.body, { childList: true, subtree: true });
}


function initUiChrome() {
  window.CDO = window.CDO || {};
  window.CDO.hookBus = window.CDO.hookBus || window.CDO.hooks?.createHookBus?.();
  initUiDropdownMenus();
  initManualModal();
  initDevToolboxModal();
  initCompareProfileModal();
}


async function init() {
  initUiChrome();
  const initialData = await IPC.invoke('pm:storage:loadAll');
  state.collections = initialData.collections || [];
  state.environments = initialData.environments || [];
  state.history = initialData.history || [];
  state.cookies = initialData.cookies || [];
  state.settings = initialData.settings || { theme: 'dark', activeEnvironmentId: '' };

  let localBackup = null;
  try {
    localBackup = JSON.parse(localStorage.getItem('ovofrito_sessions_backup') || 'null');
  } catch {}
  state.sessions = initialData.sessions || localBackup || { tabs: [], activeTabId: null, responseCache: {} };
  if (!state.sessions.responseCache || Object.keys(state.sessions.responseCache).length === 0) {
    state.sessions.responseCache = initialData.settings?.responseCache || localBackup?.responseCache || {};
  }
  // responseCache vive só em sessions — remove a cópia legada de settings para não duplicar em disco
  delete state.settings.responseCache;

  if (initialData.dataDir) {
    document.getElementById('statusStoragePath').textContent = `Armazenamento 100% Local: ${initialData.dataDir}`;
  }

  applyTheme(state.settings.theme);
  initResizersAndLayout();

  if (Array.isArray(state.sessions.tabs) && state.sessions.tabs.length > 0) {
    state.tabs = state.sessions.tabs.map((t) => ({
      ...createBlankTab(t),
      id: t.id || uid('tab'),
      response: t.response || null,
      testResults: t.testResults || null
    }));
    state.activeTabId =
      state.sessions.activeTabId && state.tabs.some((t) => t.id === state.sessions.activeTabId)
        ? state.sessions.activeTabId
        : state.tabs[0].id;
  } else if (state.collections[0]?.items?.[0]) {
    openRequestInTab(state.collections[0].items[0]);
  } else {
    const firstTab = createBlankTab();
    state.tabs.push(firstTab);
    state.activeTabId = firstTab.id;
  }

  // Atalho global Ctrl+K para buscar na Sidebar
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openCommandPalette();
    }
  });

  // Navegação da Sidebar
  document.querySelectorAll('.sidebar-nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (state.settings.layout?.sidebarCollapsed) {
        state.settings.layout.sidebarCollapsed = false;
        applyLayoutState(state.settings.layout);
        saveLayoutPrefs(state.settings.layout);
      }
      document.querySelectorAll('.sidebar-nav-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.sidebar-content').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`sidebar-${btn.dataset.sidebarTab}`).classList.add('active');
    });
  });

  const renderSidebarDebounced = debounce(renderSidebar, 250);

  document.getElementById('sidebarSearchInput').addEventListener('input', (e) => {
    state.sidebarFilter = e.target.value;
    renderSidebarDebounced();
  });

  // Botão Demo Fluxo Encadeado (se existir no DOM)
  document.getElementById('btnCreateChainedDemo')?.addEventListener('click', async () => {
    const req1 = createBlankTab({
      name: 'Login (Obter Token)',
      folder: 'Autenticação Encadeada',
      method: 'POST',
      url: 'https://jsonplaceholder.typicode.com/posts',
      headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
      body: {
        mode: 'json',
        raw: JSON.stringify({ username: 'admin', token: 'jwt-secret-token-{{$timestamp}}' }, null, 2),
        urlencoded: [],
        formdata: []
      },
      assertions: [{ source: 'status', operator: '==', target: '201', enabled: true }],
      captures: [{ key: 'json.token', value: 'api_token', enabled: true }]
    });

    const req2 = createBlankTab({
      name: ' Rota Protegida (Usa Token do Login)',
      folder: 'Autenticação Encadeada',
      method: 'GET',
      url: 'https://jsonplaceholder.typicode.com/posts/1',
      auth: {
        type: 'bearer',
        token: '{{@Login (Obter Token).json.token}}',
        username: '',
        password: '',
        keyName: '',
        keyValue: '',
        addTo: 'header'
      },
      assertions: [{ source: 'status', operator: '==', target: '200', enabled: true }]
    });

    state.tabs.push(req1, req2);
    state.activeTabId = req1.id;
    await saveSessionState();
    renderAll();
    document.getElementById('statusMessage').textContent =
      'Fluxo criado! Envie a aba "Login (Obter Token)" e veja o token ser usado automaticamente na aba "Rota Protegida".';
  });

  // Sub-abas da Requisição
  document.querySelectorAll('[data-req-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-req-tab]').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.req-tab-pane').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`req-tab-${btn.dataset.reqTab}`).classList.add('active');
    });
  });

  // Sub-abas da Resposta
  document.querySelectorAll('[data-res-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-res-tab]').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.res-tab-pane').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`res-tab-${btn.dataset.resTab}`).classList.add('active');
    });
  });

  // Eventos de edição da Requisição & Menu de Abas Abertas
  document.getElementById('btnNewTab').addEventListener('click', () => {
    const t = createBlankTab();
    state.tabs.push(t);
    state.activeTabId = t.id;
    saveSessionState();
    renderAll();
  });

  document.getElementById('btnOpenTabsActionsMenu')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = document.getElementById('tabsContextMenu');
    if (menu && !menu.classList.contains('hidden')) {
      menu.classList.add('hidden');
    } else {
      openTabsContextMenu(state.activeTabId, null, null);
    }
  });

  document.querySelectorAll('[data-tab-bulk-action]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      executeBulkTabClose(btn.dataset.tabBulkAction);
    });
  });

  document.addEventListener('click', (e) => {
    const tabsMenu = document.getElementById('tabsContextMenu');
    if (tabsMenu && !tabsMenu.classList.contains('hidden')) {
      if (!tabsMenu.contains(e.target) && e.target.id !== 'btnOpenTabsActionsMenu') {
        tabsMenu.classList.add('hidden');
      }
    }
  });

  document.getElementById('reqNameInput').addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (!tab) return;
    tab.name = e.target.value;
    syncTabBackToCollectionItem(tab, { includeHistory: false });
    renderTabsBar();
    renderSidebarDebounced();
  });

  document.getElementById('reqMethod').addEventListener('change', (e) => {
    const tab = getActiveTab();
    if (!tab) return;
    tab.method = e.target.value;
    e.target.dataset.method = tab.method;
    syncTabBackToCollectionItem(tab, { includeHistory: false });
    renderTabsBar();
    renderSidebarDebounced();
  });

  document.getElementById('reqUrl').addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (!tab) return;
    const val = e.target.value;
    if (/^\s*curl(\.exe)?\s+/i.test(val)) {
      const parsed = parseCurlCommand(val);
      if (parsed) {
        Object.assign(tab, {
          name: parsed.name,
          method: parsed.method,
          url: parsed.url,
          params: parsed.params,
          headers: parsed.headers,
          auth: parsed.auth,
          body: parsed.body
        });
        document.getElementById('statusMessage').textContent = 'Comando cURL importado automaticamente na aba ativa!';
        renderAll();
        return;
      }
    }
    tab.url = val;
    syncParamsFromUrl(tab);
    updateUrlInterpolatedPreview(tab);
    const pop = document.getElementById('varAutocompletePopover');
    const openIdx = val.lastIndexOf('{{');
    const closeIdx = val.lastIndexOf('}}');
    if (openIdx !== -1 && openIdx > closeIdx) {
      const partial = val.slice(openIdx + 2);
      renderVarAutocompletePopover(partial);
      pop?.classList.remove('hidden');
    } else {
      pop?.classList.add('hidden');
    }
    renderKeyValueTable('paramsTable', tab.params, () => {
      syncUrlFromParams(tab);
      updateUrlInterpolatedPreview(tab);
      renderActiveBadges(tab);
    });
    renderActiveBadges(tab);
    syncUrlVarHighlight();
  });

  const reqUrlEl = document.getElementById('reqUrl');
  const urlHlEl = document.getElementById('urlHighlightLayer');
  if (reqUrlEl && urlHlEl && !reqUrlEl.dataset.urlScrollBound) {
    reqUrlEl.dataset.urlScrollBound = '1';
    reqUrlEl.addEventListener('scroll', () => {
      urlHlEl.scrollLeft = reqUrlEl.scrollLeft;
    });
  }

  document.getElementById('btnToggleVarPicker')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const pop = document.getElementById('varAutocompletePopover');
    if (!pop) return;
    const isHidden = pop.classList.contains('hidden');
    if (isHidden) {
      renderVarAutocompletePopover('');
      pop.classList.remove('hidden');
    } else {
      pop.classList.add('hidden');
    }
  });

  document.addEventListener('click', (e) => {
    const pop = document.getElementById('varAutocompletePopover');
    if (pop && !pop.classList.contains('hidden')) {
      if (!pop.contains(e.target) && e.target.id !== 'btnToggleVarPicker' && e.target.id !== 'reqUrl') {
        pop.classList.add('hidden');
      }
    }
  });

  document.getElementById('reqUrl').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendActiveRequest();
  });

  document.getElementById('btnSend').addEventListener('click', sendActiveRequest);

  function serializeKvRowsToBulkText(rows, sep = '=') {
    return (rows || [])
      .filter((r) => r && (r.key || r.value))
      .map((r) => `${r.enabled === false ? '# ' : ''}${r.key || ''}${sep}${r.value ?? ''}`)
      .join('\n');
  }

  function parseBulkTextToKvRows(text, sep = '=') {
    return String(text || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        let enabled = true;
        let clean = line;
        if (clean.startsWith('#')) {
          enabled = false;
          clean = clean.slice(1).trim();
        }
        const idx = clean.indexOf(sep.trim());
        if (idx === -1) return { key: clean, value: '', enabled };
        return {
          key: clean.slice(0, idx).trim(),
          value: clean.slice(idx + sep.trim().length).trim(),
          enabled
        };
      });
  }

  document.getElementById('btnBulkEditParams')?.addEventListener('click', () => {
    const tab = getActiveTab();
    if (!tab) return;
    const tableEl = document.getElementById('paramsTable');
    const areaEl = document.getElementById('paramsBulkTextarea');
    if (!tableEl || !areaEl) return;
    const enteringBulk = areaEl.classList.contains('hidden');
    if (enteringBulk) {
      areaEl.value = serializeKvRowsToBulkText(tab.params, '=');
      tableEl.classList.add('hidden');
      areaEl.classList.remove('hidden');
    } else {
      tab.params = parseBulkTextToKvRows(areaEl.value, '=');
      syncUrlFromParams(tab);
      areaEl.classList.add('hidden');
      tableEl.classList.remove('hidden');
      renderActiveRequest();
    }
  });

  document.getElementById('paramsBulkTextarea')?.addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (!tab) return;
    tab.params = parseBulkTextToKvRows(e.target.value, '=');
    syncUrlFromParams(tab);
    updateUrlInterpolatedPreview(tab);
    renderActiveBadges(tab);
  });

  document.getElementById('btnBulkEditHeaders')?.addEventListener('click', () => {
    const tab = getActiveTab();
    if (!tab) return;
    const tableEl = document.getElementById('headersTable');
    const areaEl = document.getElementById('headersBulkTextarea');
    if (!tableEl || !areaEl) return;
    const enteringBulk = areaEl.classList.contains('hidden');
    if (enteringBulk) {
      areaEl.value = serializeKvRowsToBulkText(tab.headers, ': ');
      tableEl.classList.add('hidden');
      areaEl.classList.remove('hidden');
    } else {
      tab.headers = parseBulkTextToKvRows(areaEl.value, ':');
      areaEl.classList.add('hidden');
      tableEl.classList.remove('hidden');
      renderActiveRequest();
    }
  });

  document.getElementById('headersBulkTextarea')?.addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (!tab) return;
    tab.headers = parseBulkTextToKvRows(e.target.value, ':');
    renderActiveBadges(tab);
  });

  document.getElementById('btnAddParam').addEventListener('click', () => {
    const tab = getActiveTab();
    if (!tab) return;
    tab.params.push({ key: '', value: '', enabled: true });
    renderActiveRequest();
  });

  document.getElementById('btnAddHeader').addEventListener('click', () => {
    const tab = getActiveTab();
    if (!tab) return;
    tab.headers.push({ key: '', value: '', enabled: true });
    renderActiveRequest();
  });

  document.getElementById('btnAddAssertion').addEventListener('click', () => {
    const tab = getActiveTab();
    if (!tab) return;
    tab.assertions.push({ source: 'status', operator: '==', target: '200', enabled: true });
    renderActiveRequest();
  });

  document.getElementById('btnAddCapture').addEventListener('click', () => {
    const tab = getActiveTab();
    if (!tab) return;
    tab.captures.push({ key: 'json.id', value: 'captured_id', enabled: true });
    renderActiveRequest();
  });

  document.getElementById('btnAddPreDbQuery')?.addEventListener('click', () => {
    const tab = getActiveTab();
    if (!tab) return;
    if (!Array.isArray(tab.preDbQueries)) tab.preDbQueries = [];
    tab.preDbQueries.push({
      id: uid('dbq'),
      name: `pre_${tab.preDbQueries.length + 1}`,
      query: 'SELECT id, name, email FROM users LIMIT 1',
      params: '[]',
      captures: 'rows[0].id -> seeded_id',
      enabled: true
    });
    renderActiveRequest();
  });

  document.getElementById('btnAddPostDbQuery')?.addEventListener('click', () => {
    const tab = getActiveTab();
    if (!tab) return;
    if (!Array.isArray(tab.postDbQueries)) tab.postDbQueries = [];
    tab.postDbQueries.push({
      id: uid('dbq'),
      name: `post_${tab.postDbQueries.length + 1}`,
      query: 'SELECT id, name, email FROM users WHERE id = $1',
      params: '[response.body.id]',
      captures: '',
      enabled: true
    });
    renderActiveRequest();
  });

  // Auth events
  document.getElementById('authType').addEventListener('change', (e) => {
    const tab = getActiveTab();
    if (!tab) return;
    tab.auth.type = e.target.value;
    renderActiveRequest();
  });

  document.getElementById('btnOpenColConfigFromAuth')?.addEventListener('click', () => {
    const tab = getActiveTab();
    if (!tab || !tab.collectionId) {
      document.getElementById('statusMessage').textContent = 'Salve esta requisição em uma Collection primeiro (Ctrl+S) para configurar a autenticação da Collection.';
      return;
    }
    const col = state.collections.find((c) => c.id === tab.collectionId);
    if (col) openCollectionConfigModal(col);
  });

  document.getElementById('authBearerToken').addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (tab) {
      tab.auth.token = e.target.value;
      renderJwtInspector(tab);
    }
  });

  document.getElementById('authBasicUser').addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (tab) tab.auth.username = e.target.value;
  });

  document.getElementById('authBasicPass').addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (tab) tab.auth.password = e.target.value;
  });

  document.getElementById('authApiKeyName').addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (tab) tab.auth.keyName = e.target.value;
  });

  document.getElementById('authApiKeyValue').addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (tab) tab.auth.keyValue = e.target.value;
  });

  document.getElementById('authApiKeyAddTo').addEventListener('change', (e) => {
    const tab = getActiveTab();
    if (tab) tab.auth.addTo = e.target.value;
  });

  document.getElementById('oauthGrantType').addEventListener('change', (e) => {
    const tab = getActiveTab();
    if (tab) tab.auth.grantType = e.target.value;
  });

  document.getElementById('oauthTokenUrl').addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (tab) tab.auth.tokenUrl = e.target.value;
  });

  document.getElementById('oauthClientId').addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (tab) tab.auth.clientId = e.target.value;
  });

  document.getElementById('oauthClientSecret').addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (tab) tab.auth.clientSecret = e.target.value;
  });

  document.getElementById('oauthAccessTokenInput').addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (tab) tab.auth.token = e.target.value;
  });

  document.getElementById('authDigestUser')?.addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (tab) tab.auth.username = e.target.value;
  });
  document.getElementById('authDigestPass')?.addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (tab) tab.auth.password = e.target.value;
  });
  document.getElementById('authAwsAccessKey')?.addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (tab) tab.auth.accessKey = e.target.value;
  });
  document.getElementById('authAwsSecretKey')?.addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (tab) tab.auth.secretKey = e.target.value;
  });
  document.getElementById('authAwsRegion')?.addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (tab) tab.auth.region = e.target.value || 'us-east-1';
  });
  document.getElementById('authAwsService')?.addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (tab) tab.auth.service = e.target.value || 'execute-api';
  });
  document.getElementById('authAwsSessionToken')?.addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (tab) tab.auth.sessionToken = e.target.value;
  });

  document.getElementById('btnFetchOAuthToken').addEventListener('click', async () => {
    const tab = getActiveTab();
    if (tab?.auth?.grantType === 'authorization_code') {
      document.getElementById('statusMessage').textContent = 'Para Authorization Code use o botão "Autorizar PKCE" (callback local 127.0.0.1).';
      return;
    }
    if (!tab || !tab.auth.tokenUrl) {
      document.getElementById('statusMessage').textContent = 'Informe a Access Token URL para obter o token OAuth 2.0.';
      return;
    }
    const res = await IPC.invoke('pm:runtime:request', {
      method: 'POST',
      url: interpolateVariables(tab.auth.tokenUrl),
      headers: [{ key: 'Content-Type', value: 'application/x-www-form-urlencoded', enabled: true }],
      body: {
        mode: 'urlencoded',
        urlencoded: [
          { key: 'grant_type', value: tab.auth.grantType || 'client_credentials', enabled: true },
          { key: 'client_id', value: interpolateVariables(tab.auth.clientId || ''), enabled: true },
          { key: 'client_secret', value: interpolateVariables(tab.auth.clientSecret || ''), enabled: true }
        ]
      }
    });
    if (res.ok) {
      try {
        const parsed = JSON.parse(res.body);
        const tk = parsed.access_token || parsed.token || parsed.id_token || '';
        if (tk) {
          tab.auth.token = String(tk);
          document.getElementById('oauthAccessTokenInput').value = tab.auth.token;
          document.getElementById('statusMessage').textContent = 'Access Token OAuth 2.0 obtido com sucesso!';
        }
      } catch {}
    } else {
      document.getElementById('statusMessage').textContent = `Falha ao obter token OAuth 2.0: ${res.error || res.statusText}`;
    }
  });

  // Botões de Request Chaining na aba Authorization
  document.getElementById('btnBindChainRef').addEventListener('click', () => {
    const tab = getActiveTab();
    if (!tab) return;
    const reqRef = document.getElementById('chainSourceReqSelect').value || 'last';
    const fieldPath = document.getElementById('chainSourceFieldSelect').value || 'json.token';
    const expr = `{{@${reqRef}.${fieldPath}}}`;
    if (tab.auth.type === 'bearer' || tab.auth.type === 'oauth2') {
      tab.auth.token = expr;
      document.getElementById('authBearerToken').value = expr;
      document.getElementById('oauthAccessTokenInput').value = expr;
    } else if (tab.auth.type === 'apikey') {
      tab.auth.keyValue = expr;
      document.getElementById('authApiKeyValue').value = expr;
      if (!tab.auth.keyName) {
        tab.auth.keyName = 'X-API-Key';
        document.getElementById('authApiKeyName').value = 'X-API-Key';
      }
    }
    saveSessionState();
    document.getElementById('statusMessage').textContent = `Autenticação vinculada dinamicamente a ${expr}!`;
  });

  document.getElementById('btnBindEnvToken').addEventListener('click', async () => {
    const tab = getActiveTab();
    if (!tab) return;
    const reqRef = document.getElementById('chainSourceReqSelect').value || 'last';
    const fieldPath = document.getElementById('chainSourceFieldSelect').value || 'json.token';
    const expr = `{{@${reqRef}.${fieldPath}}}`;
    const resolvedVal = interpolateVariables(expr);

    let env = getActiveEnvironment();
    if (!env) {
      env = state.environments[0] || { id: uid('env'), name: 'Default Environment', variables: [] };
      if (!state.environments.includes(env)) state.environments.push(env);
      state.settings.activeEnvironmentId = env.id;
    }
    const existing = env.variables.find((v) => v.key === 'api_token');
    if (existing) {
      if (resolvedVal !== expr) existing.value = resolvedVal;
      existing.enabled = true;
    } else {
      env.variables.push({ key: 'api_token', value: resolvedVal !== expr ? resolvedVal : '', enabled: true, secret: true });
    }

    const sourceTab = state.tabs.find((t) => (t.name || '').trim().toLowerCase() === reqRef.toLowerCase());
    if (sourceTab) {
      if (!Array.isArray(sourceTab.captures)) sourceTab.captures = [];
      if (!sourceTab.captures.some((c) => c.key === fieldPath && c.value === 'api_token')) {
        sourceTab.captures.push({ key: fieldPath, value: 'api_token', enabled: true });
      }
    }

    if (tab.auth.type === 'bearer' || tab.auth.type === 'oauth2') {
      tab.auth.token = '{{api_token}}';
      document.getElementById('authBearerToken').value = '{{api_token}}';
      document.getElementById('oauthAccessTokenInput').value = '{{api_token}}';
    } else if (tab.auth.type === 'apikey') {
      tab.auth.keyValue = '{{api_token}}';
      document.getElementById('authApiKeyValue').value = '{{api_token}}';
    }

    await persistStore('environments');
    await persistStore('settings');
    await saveSessionState();
    renderSidebar();
    document.getElementById('statusMessage').textContent = `Token vinculado à variável compartilhada {{api_token}} em todas as sessões!`;
  });

  // Body events
  document.querySelectorAll('input[name="bodyMode"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      const tab = getActiveTab();
      if (!tab) return;
      tab.body.mode = e.target.value;
      if (tab.body.mode === 'urlencoded' && (!tab.body.urlencoded || tab.body.urlencoded.length === 0)) {
        tab.body.urlencoded = [{ key: '', value: '', enabled: true }];
      } else if (tab.body.mode === 'formdata' && (!tab.body.formdata || tab.body.formdata.length === 0)) {
        tab.body.formdata = [{ key: '', type: 'text', value: '', enabled: true }];
      }
      renderActiveRequest();
    });
  });

  document.getElementById('bodyRawInput').addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (tab) tab.body.raw = e.target.value;
    syncJsonEditor();
  });

  const bodyRawInputEl = document.getElementById('bodyRawInput');
  const bodyJsonHighlightEl = document.getElementById('bodyJsonHighlight');
  if (bodyRawInputEl && bodyJsonHighlightEl && !bodyRawInputEl.dataset.jsonScrollBound) {
    bodyRawInputEl.dataset.jsonScrollBound = '1';
    bodyRawInputEl.addEventListener('scroll', () => {
      bodyJsonHighlightEl.scrollTop = bodyRawInputEl.scrollTop;
      bodyJsonHighlightEl.scrollLeft = bodyRawInputEl.scrollLeft;
    });
  }

  document.getElementById('graphqlQueryInput').addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (tab) tab.body.graphqlQuery = e.target.value;
  });

  document.getElementById('graphqlVarsInput').addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (tab) tab.body.graphqlVars = e.target.value;
  });

  document.getElementById('preRequestScriptInput').addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (!tab) return;
    tab.preRequestScript = e.target.value;
    renderActiveBadges(tab);
  });

  document.getElementById('postResponseScriptInput').addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (!tab) return;
    tab.postResponseScript = e.target.value;
    renderActiveBadges(tab);
  });

  document.getElementById('btnInsertSamplePmScript').addEventListener('click', () => {
    const tab = getActiveTab();
    if (!tab) return;
    tab.postResponseScript = [
      `pm.test("Status HTTP é 200 ou 201", () => {`,
      `  pm.expect(pm.response.code).to.be.below(300);`,
      `});`,
      ``,
      `pm.test("Resposta JSON possui dados", () => {`,
      `  const data = pm.response.json();`,
      `  pm.expect(data).to.exist;`,
      `});`
    ].join('\n');
    document.getElementById('postResponseScriptInput').value = tab.postResponseScript;
    renderActiveBadges(tab);
  });

  document.getElementById('btnInsertSampleDbScript')?.addEventListener('click', () => {
    const tab = getActiveTab();
    if (!tab) return;
    tab.postResponseScript = [
      `pm.test("Registro persistido no banco após POST", async () => {`,
      `  const dbResult = await pm.db.query(`,
      `    "SELECT id, name, email FROM users WHERE id = $1",`,
      `    [response.body.id]`,
      `  );`,
      `  pm.expect(dbResult.rowCount).to.equal(1);`,
      `  pm.expect(dbResult.rows[0].name).to.equal("Carlos");`,
      `});`
    ].join('\n');
    document.getElementById('postResponseScriptInput').value = tab.postResponseScript;
    renderActiveBadges(tab);
  });

  document.getElementById('btnBeautifyJson').addEventListener('click', () => {
    const tab = getActiveTab();
    if (!tab || !tab.body.raw) return;
    try {
      tab.body.raw = JSON.stringify(JSON.parse(tab.body.raw), null, 2);
      document.getElementById('bodyRawInput').value = tab.body.raw;
    } catch {
      document.getElementById('statusMessage').textContent = 'JSON inválido para formatação.';
    }
  });

  document.getElementById('btnAddFormRow').addEventListener('click', () => {
    const tab = getActiveTab();
    if (!tab) return;
    if (!Array.isArray(tab.body.urlencoded)) tab.body.urlencoded = [];
    tab.body.urlencoded.push({ key: '', value: '', enabled: true });
    renderActiveRequest();
  });

  document.getElementById('btnAddMultipartRow').addEventListener('click', () => {
    const tab = getActiveTab();
    if (!tab) return;
    if (!Array.isArray(tab.body.formdata)) tab.body.formdata = [];
    tab.body.formdata.push({ key: '', type: 'text', value: '', enabled: true });
    renderActiveRequest();
  });

  // Visualização da Resposta (Pretty / Raw / Filtro JSON / Copiar)
  document.getElementById('btnViewPretty').addEventListener('click', () => {
    state.responseViewMode = 'pretty';
    document.getElementById('btnViewPretty').classList.add('active');
    document.getElementById('btnViewRaw').classList.remove('active');
    renderResponse(getActiveTab());
  });

  document.getElementById('btnViewRaw').addEventListener('click', () => {
    state.responseViewMode = 'raw';
    document.getElementById('btnViewRaw').classList.add('active');
    document.getElementById('btnViewPretty').classList.remove('active');
    renderResponse(getActiveTab());
  });

  document.getElementById('resJsonFilterInput').addEventListener('input', (e) => {
    state.responseJsonFilter = e.target.value;
    renderResponse(getActiveTab());
  });

  document.getElementById('btnCopyResponse').addEventListener('click', () => {
    const text = document.getElementById('responseBodyPre').textContent || '';
    navigator.clipboard.writeText(text);
    document.getElementById('statusMessage').textContent = 'Resposta copiada para a área de transferência.';
  });

  // Tema Dark / Light
  document.getElementById('btnToggleTheme').addEventListener('click', async () => {
    state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
    applyTheme(state.settings.theme);
    await persistStore('settings');
  });

  // Environment Selector, Profiles, Contorno da Requisição, Segredos e .env
  document.getElementById('envSelect').addEventListener('change', async (e) => {
    state.settings.activeEnvironmentId = e.target.value;
    await persistStore('settings');
    renderAll();
  });

  document.getElementById('envProfileQuickSelect')?.addEventListener('change', async (e) => {
    const chosenProfile = e.target.value;
    let env = getActiveEnvironment();
    if (!env) {
      if (state.environments.length === 0) {
        env = {
          id: uid('env'),
          name: 'JSONPlaceholder (Local)',
          profile: '',
          borderColor: '',
          customProfiles: [],
          profileVariables: {},
          variables: [{ key: 'base_url', value: 'https://jsonplaceholder.typicode.com', enabled: true, secret: false }]
        };
        state.environments.push(env);
      } else {
        env = state.environments[0];
      }
      state.settings.activeEnvironmentId = env.id;
    }

    if (chosenProfile === '__create__') {
      openEnvModal(env.id);
      setTimeout(() => {
        document.getElementById('envNewProfileNameInput')?.focus();
      }, 40);
      applyActiveEnvProfileContour();
      return;
    }

    switchEnvironmentActiveProfile(env, chosenProfile);
    await persistStore('environments');
    await persistStore('settings');
    renderAll();
    const meta = getEnvProfileMeta(env);
    if (meta.label) {
      document.getElementById('statusMessage').textContent = meta.hasContour
        ? `Profile "${meta.label}" ativado em "${env.name}" — Contorno ${meta.borderColor} aplicado na requisição!`
        : `Profile "${meta.label}" ativado em "${env.name}" — Sem contorno customizado na requisição.`;
    } else {
      document.getElementById('statusMessage').textContent = `Environment "${env.name}" sem profile específico ativo.`;
    }
  });

  document.getElementById('envQuickColorPicker')?.addEventListener('input', async (e) => {
    const env = getActiveEnvironment();
    if (!env) return;
    ensureEnvProfileStructure(env);
    env.borderColor = e.target.value;
    const cp = (env.customProfiles || []).find((x) => x.id === env.profile);
    if (cp) cp.borderColor = e.target.value;
    applyActiveEnvProfileContour();
    await persistStore('environments');
    renderSidebar();
  });

  document.getElementById('envModalProfileSelect')?.addEventListener('change', (e) => {
    const env = state.environments.find((x) => x.id === editingEnvId);
    if (!env) return;
    switchEnvironmentActiveProfile(env, e.target.value);
    syncEnvModalProfileControls(env);
    renderEnvVarsTable(env.variables);
    if (env.id === state.settings.activeEnvironmentId) {
      applyActiveEnvProfileContour();
    }
  });

  const handleCreateCustomEnvProfile = () => {
    const env = state.environments.find((x) => x.id === editingEnvId);
    if (!env) return;
    ensureEnvProfileStructure(env);
    const nameInput = document.getElementById('envNewProfileNameInput');
    const typedName = (nameInput?.value || '').trim();
    const count = (env.customProfiles?.length || 0) + 1;
    const newProfName = typedName || `Profile ${count}`;
    const newProfId = `prof_${Date.now()}`;

    const modeSelect = document.getElementById('envModalContourModeSelect');
    const colorInput = document.getElementById('envModalBorderColorInput');
    const initialColor = modeSelect?.value === 'custom' ? (colorInput?.value || '#ef4444') : '';

    env.customProfiles.push({
      id: newProfId,
      name: newProfName,
      borderColor: initialColor
    });
    if (nameInput) nameInput.value = '';
    switchEnvironmentActiveProfile(env, newProfId, initialColor);
    syncEnvModalProfileControls(env);
    renderEnvVarsTable(env.variables);
    if (env.id === state.settings.activeEnvironmentId) {
      applyActiveEnvProfileContour();
    }
  };

  document.getElementById('btnAddCustomEnvProfile')?.addEventListener('click', handleCreateCustomEnvProfile);

  document.getElementById('envNewProfileNameInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCreateCustomEnvProfile();
    }
  });

  document.getElementById('btnDeleteCustomEnvProfile')?.addEventListener('click', () => {
    const env = state.environments.find((x) => x.id === editingEnvId);
    if (!env || !env.profile) return;
    ensureEnvProfileStructure(env);
    const idx = env.customProfiles.findIndex((cp) => cp.id === env.profile);
    if (idx !== -1) {
      const removedId = env.customProfiles[idx].id;
      env.customProfiles.splice(idx, 1);
      delete env.profileVariables[removedId];
    }
    switchEnvironmentActiveProfile(env, '', '');
    syncEnvModalProfileControls(env);
    renderEnvVarsTable(env.variables);
    if (env.id === state.settings.activeEnvironmentId) {
      applyActiveEnvProfileContour();
    }
  });

  document.getElementById('envModalContourModeSelect')?.addEventListener('change', (e) => {
    const env = state.environments.find((x) => x.id === editingEnvId);
    if (!env) return;
    const mode = e.target.value;
    if (mode === 'custom') {
      env.borderColor = document.getElementById('envModalBorderColorInput')?.value || '#ef4444';
    } else {
      env.borderColor = '';
    }
    const cp = (env.customProfiles || []).find((x) => x.id === env.profile);
    if (cp) cp.borderColor = env.borderColor;
    syncEnvModalProfileControls(env);
    if (env.id === state.settings.activeEnvironmentId) {
      applyActiveEnvProfileContour();
    }
  });

  document.getElementById('envModalBorderColorInput')?.addEventListener('input', (e) => {
    const env = state.environments.find((x) => x.id === editingEnvId);
    if (!env) return;
    env.borderColor = e.target.value;
    const cp = (env.customProfiles || []).find((x) => x.id === env.profile);
    if (cp) cp.borderColor = env.borderColor;
    syncEnvModalProfileControls(env);
    if (env.id === state.settings.activeEnvironmentId) {
      applyActiveEnvProfileContour();
    }
  });

  document.getElementById('envConfirmDestructiveCheckbox')?.addEventListener('change', (e) => {
    const env = state.environments.find((x) => x.id === editingEnvId);
    if (!env) return;
    const checked = Boolean(e.target.checked);
    const cp = (env.customProfiles || []).find((x) => x.id === env.profile);
    if (cp) {
      cp.confirmDestructive = checked;
    } else {
      env.confirmDestructive = checked;
    }
    updateUrlInterpolatedPreview(getActiveTab());
  });

  document.getElementById('btnManageEnv').addEventListener('click', () => {
    openEnvModal(state.settings.activeEnvironmentId);
  });

  document.getElementById('btnNewEnvironment').addEventListener('click', () => {
    openEnvModal(null);
  });

  document.getElementById('btnAddEnvVar').addEventListener('click', () => {
    const env = state.environments.find((e) => e.id === editingEnvId);
    if (!env) return;
    env.variables.push({ key: '', value: '', enabled: true, secret: false });
    renderEnvVarsTable(env.variables);
  });

  document.getElementById('importEnvFileInput').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const env = state.environments.find((x) => x.id === editingEnvId);
      if (!env) return;
      String(reader.result || '')
        .split(/\r?\n/)
        .forEach((line) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) return;
          const eq = trimmed.indexOf('=');
          if (eq !== -1) {
            const k = trimmed.slice(0, eq).trim();
            const v = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
            const existing = env.variables.find((item) => item.key === k);
            if (existing) {
              existing.value = v;
            } else {
              env.variables.push({ key: k, value: v, enabled: true, secret: /token|secret|key|pass/i.test(k) });
            }
          }
        });
      renderEnvVarsTable(env.variables);
    };
    reader.readAsText(file);
  });

  document.getElementById('btnExportEnvFile').addEventListener('click', () => {
    const env = state.environments.find((x) => x.id === editingEnvId);
    if (!env) return;
    const content = (env.variables || [])
      .filter((v) => v.key)
      .map((v) => `${v.key}=${v.value ?? ''}`)
      .join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(env.name || 'environment').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.env`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  function readEnvModalDbConfigInto(env) {
    if (!env) return;
    ensureEnvProfileStructure(env);
    env.database = {
      enabled: Boolean(document.getElementById('envDbEnabledCheckbox')?.checked),
      client: document.getElementById('envDbClientSelect')?.value || 'postgres',
      connectionString: document.getElementById('envDbConnectionStringInput')?.value || '',
      host: document.getElementById('envDbHostInput')?.value || '127.0.0.1',
      port: document.getElementById('envDbPortInput')?.value || '5432',
      database: document.getElementById('envDbDatabaseInput')?.value || '',
      user: document.getElementById('envDbUserInput')?.value || '',
      password: document.getElementById('envDbPasswordInput')?.value || '',
      ssl: Boolean(document.getElementById('envDbSslCheckbox')?.checked)
    };
  }

  [
    'envDbEnabledCheckbox',
    'envDbClientSelect',
    'envDbConnectionStringInput',
    'envDbHostInput',
    'envDbPortInput',
    'envDbDatabaseInput',
    'envDbUserInput',
    'envDbPasswordInput',
    'envDbSslCheckbox'
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const evt = el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(evt, () => {
      const env = state.environments.find((e) => e.id === editingEnvId);
      if (!env) return;
      if (id === 'envDbClientSelect') {
        const portEl = document.getElementById('envDbPortInput');
        if (portEl && (portEl.value === '5432' || portEl.value === '3306' || !portEl.value)) {
          portEl.value = el.value === 'mysql' ? '3306' : el.value === 'postgres' ? '5432' : '';
        }
      }
      readEnvModalDbConfigInto(env);
    });
  });

  document.getElementById('btnTestEnvDbConnection')?.addEventListener('click', async () => {
    const env = state.environments.find((e) => e.id === editingEnvId);
    if (!env) return;
    readEnvModalDbConfigInto(env);
    const badge = document.getElementById('envDbTestStatusBadge');
    if (badge) {
      badge.textContent = '⏳ Testando conexão...';
      badge.style.color = 'var(--text-secondary)';
    }
    try {
      const conn = resolveActiveDbConnection({ ...env, database: { ...env.database, enabled: true } });
      const res = await IPC.invoke('pm:db:testConnection', { connection: conn, timeoutMs: 8000 });
      if (badge) {
        if (res && res.ok) {
          badge.textContent = `✅ Conectado (${res.durationMs || 0}ms)`;
          badge.style.color = '#4ade80';
        } else {
          badge.textContent = `❌ ${res?.error || 'Falha na conexão'}`;
          badge.style.color = '#f87171';
        }
      }
    } catch (err) {
      if (badge) {
        badge.textContent = `❌ ${err.message || err}`;
        badge.style.color = '#f87171';
      }
    }
  });

  document.getElementById('btnSaveEnvModal').addEventListener('click', async () => {
    const env = state.environments.find((e) => e.id === editingEnvId);
    if (env) {
      env.name = document.getElementById('envNameInput').value.trim() || 'Environment';
      readEnvModalDbConfigInto(env);
      await persistStore('environments');
      await persistStore('settings');
    }
    document.getElementById('envModal').classList.add('hidden');
    renderSidebar();
  });

  document.getElementById('btnDeleteEnv').addEventListener('click', async () => {
    const idx = state.environments.findIndex((e) => e.id === editingEnvId);
    if (idx !== -1) {
      state.environments.splice(idx, 1);
      if (state.settings.activeEnvironmentId === editingEnvId) {
        state.settings.activeEnvironmentId = state.environments[0]?.id || '';
      }
      await persistStore('environments');
      await persistStore('settings');
    }
    document.getElementById('envModal').classList.add('hidden');
    renderSidebar();
  });

  document.getElementById('btnCloseEnvModal').addEventListener('click', () => {
    document.getElementById('envModal').classList.add('hidden');
  });

  // Cookie Jar Modal events
  document.getElementById('btnOpenCookiesModal').addEventListener('click', () => {
    document.getElementById('networkModal')?.classList.add('hidden');
    renderCookieJarModal();
    document.getElementById('cookiesModal').classList.remove('hidden');
  });

  document.getElementById('btnCloseCookiesModal').addEventListener('click', () => {
    document.getElementById('cookiesModal').classList.add('hidden');
  });

  document.getElementById('btnAddCookieRow').addEventListener('click', () => {
    state.cookies.push({ domain: 'localhost', name: '', value: '', path: '/' });
    renderCookieJarModal();
  });

  document.getElementById('btnClearCookies').addEventListener('click', () => {
    state.cookies = [];
    renderCookieJarModal();
  });

  document.getElementById('btnSaveCookieJar').addEventListener('click', async () => {
    state.cookies = state.cookies.filter((c) => c.domain && c.name);
    await persistStore('cookies');
    document.getElementById('cookiesModal').classList.add('hidden');
    renderActiveRequest();
  });

  // Runner Modal close & Data File (.json / .csv)
  document.getElementById('btnCloseRunnerModal').addEventListener('click', () => {
    document.getElementById('runnerModal').classList.add('hidden');
  });

  document.getElementById('runnerDataFileInput')?.addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    const badge = document.getElementById('runnerDataFileBadge');
    if (!f) {
      runnerDatasetRows = [];
      if (badge) badge.textContent = 'Sem arquivo de dados (1 iteração)';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || '').trim();
      try {
        if (f.name.toLowerCase().endsWith('.csv')) {
          runnerDatasetRows = parseRunnerCsvData(raw);
        } else {
          const parsed = JSON.parse(raw);
          runnerDatasetRows = Array.isArray(parsed) ? parsed : [parsed];
        }
        if (badge) badge.textContent = `📎 ${f.name} (${runnerDatasetRows.length} iterações)`;
      } catch {
        runnerDatasetRows = [];
        if (badge) badge.textContent = 'Arquivo inválido';
      }
    };
    reader.readAsText(f);
  });

  document.getElementById('btnRerunCollectionRunner')?.addEventListener('click', () => {
    const col = state.collections.find((c) => c.id === activeRunnerCollectionId);
    if (col) runCollectionSequentially(col);
  });

  // Diff Modal close
  document.getElementById('btnCloseHistoryDiffModal')?.addEventListener('click', () => {
    document.getElementById('historyDiffModal')?.classList.add('hidden');
  });

  // Collection Config Modal (Auth Herdada, Pastas e Variáveis da Collection)
  document.getElementById('btnCloseCollectionConfigModal')?.addEventListener('click', () => {
    document.getElementById('collectionConfigModal')?.classList.add('hidden');
  });

  document.getElementById('colAuthTypeSelect')?.addEventListener('change', (e) => {
    syncCollectionConfigAuthFields(e.target.value);
  });

  document.getElementById('btnAddCollectionVar')?.addEventListener('click', () => {
    const col = state.collections.find((c) => c.id === editingCollectionConfigId);
    if (!col) return;
    if (!Array.isArray(col.variables)) col.variables = [];
    col.variables.push({ key: '', value: '', enabled: true });
    renderKeyValueTable('collectionVarsTable', col.variables, () => {}, {
      key: 'Variável da Collection (ex: service_prefix)',
      value: 'Valor (viaja no arquivo .ovo da Collection)'
    });
  });

  document.getElementById('btnSaveCollectionConfigModal')?.addEventListener('click', async () => {
    const col = state.collections.find((c) => c.id === editingCollectionConfigId);
    if (col) {
      if (Array.isArray(col.variables)) {
        col.variables = col.variables.filter((v) => v && v.key && v.key.trim());
      }
      col.auth = {
        type: document.getElementById('colAuthTypeSelect')?.value || 'none',
        token: document.getElementById('colAuthBearerTokenInput')?.value || '',
        username: document.getElementById('colAuthBasicUserInput')?.value || '',
        password: document.getElementById('colAuthBasicPassInput')?.value || '',
        keyName: document.getElementById('colAuthApiKeyNameInput')?.value || 'X-API-Key',
        keyValue: document.getElementById('colAuthApiKeyValueInput')?.value || '',
        addTo: document.getElementById('colAuthApiKeyAddToSelect')?.value || 'header'
      };
    }
    await persistStore('collections');
    document.getElementById('collectionConfigModal')?.classList.add('hidden');
    renderAll();
    document.getElementById('statusMessage').textContent = `Autenticação, pastas e variáveis da Collection "${col?.name || ''}" salvas!`;
  });

  document.getElementById('btnClearScriptConsole')?.addEventListener('click', () => {
    const tab = getActiveTab();
    if (!tab) return;
    tab.scriptConsoleLogs = [];
    renderResponse(tab);
  });

  // Command Palette (Ctrl+K)
  document.getElementById('btnOpenCommandPalette')?.addEventListener('click', openCommandPalette);
  document.getElementById('btnCloseCommandPalette')?.addEventListener('click', () => {
    document.getElementById('commandPaletteModal')?.classList.add('hidden');
  });
  document.getElementById('commandPaletteInput')?.addEventListener('input', (e) => {
    renderCommandPaletteList(e.target.value);
  });
  document.getElementById('commandPaletteInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.getElementById('commandPaletteModal')?.classList.add('hidden');
    } else if (e.key === 'Enter') {
      const items = getCommandPaletteActions(e.target.value);
      if (items.length > 0) {
        document.getElementById('commandPaletteModal')?.classList.add('hidden');
        items[0].run();
      }
    }
  });

  // Network Modal (Proxy, Certificado SSL/TLS, mTLS & Exportar Workspace .ovo)
  document.getElementById('btnOpenNetworkModal')?.addEventListener('click', () => openNetworkModal());
  document.getElementById('statusNetworkSummary')?.addEventListener('click', () => openNetworkModal('network'));

  document.querySelectorAll('#networkModal [data-cfg-tab]').forEach((btn) => {
    btn.addEventListener('click', () => switchNetworkConfigTab(btn.dataset.cfgTab));
  });

  document.getElementById('btnCloseNetworkModal')?.addEventListener('click', () => {
    document.getElementById('networkModal')?.classList.add('hidden');
  });

  document.getElementById('btnExportWorkspaceOvo')?.addEventListener('click', () => {
    exportWorkspaceAsOvo();
  });

  document.getElementById('btnDownloadResponse')?.addEventListener('click', () => {
    const tab = getActiveTab();
    const bodyText = tab?.response?.body || document.getElementById('responseBodyPre')?.textContent || '';
    if (!bodyText) return;
    let ext = 'txt';
    try {
      JSON.parse(bodyText);
      ext = 'json';
    } catch {}
    const blob = new Blob([bodyText], { type: ext === 'json' ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const slug = (tab?.name || 'response').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'response';
    a.download = `${slug}-response.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
    document.getElementById('statusMessage').textContent = `Resposta baixada como "${slug}-response.${ext}"!`;
  });

  document.getElementById('netMtlsCertFileInput')?.addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const commaIdx = dataUrl.indexOf(',');
      const net = ensureNetworkSettings();
      net.mtls.fileName = f.name;
      net.mtls.certBase64 = commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : '';
      net.mtls.enabled = true;
      const chk = document.getElementById('netMtlsEnabledCheckbox');
      const nameBadge = document.getElementById('netMtlsCertFileName');
      if (chk) chk.checked = true;
      if (nameBadge) nameBadge.textContent = f.name;
    };
    reader.readAsDataURL(f);
  });

  document.getElementById('btnClearMtlsCert')?.addEventListener('click', () => {
    const net = ensureNetworkSettings();
    net.mtls.fileName = '';
    net.mtls.certBase64 = '';
    net.mtls.enabled = false;
    const chk = document.getElementById('netMtlsEnabledCheckbox');
    const nameBadge = document.getElementById('netMtlsCertFileName');
    if (chk) chk.checked = false;
    if (nameBadge) nameBadge.textContent = 'Nenhum certificado carregado';
  });

  document.getElementById('netProxyEnabledCheckbox')?.addEventListener('change', (e) => {
    const fieldsBox = document.getElementById('netProxyFieldsContainer');
    if (fieldsBox) {
      fieldsBox.style.opacity = e.target.checked ? '1' : '0.55';
    }
  });

  document.getElementById('btnSaveNetworkModal')?.addEventListener('click', async () => {
    const net = ensureNetworkSettings();
    net.ignoreCertErrors = Boolean(document.getElementById('netIgnoreCertErrorsCheckbox')?.checked);
    net.timeoutMs = Math.max(1000, Number(document.getElementById('netTimeoutMsInput')?.value) || 30000);
    net.mtls = {
      ...net.mtls,
      enabled: Boolean(document.getElementById('netMtlsEnabledCheckbox')?.checked),
      passphrase: document.getElementById('netMtlsPassphraseInput')?.value || ''
    };
    net.proxy = {
      enabled: Boolean(document.getElementById('netProxyEnabledCheckbox')?.checked),
      protocol: document.getElementById('netProxyProtocolSelect')?.value || 'http',
      host: (document.getElementById('netProxyHostInput')?.value || '').trim(),
      port: (document.getElementById('netProxyPortInput')?.value || '8080').trim(),
      username: (document.getElementById('netProxyUsernameInput')?.value || '').trim(),
      password: document.getElementById('netProxyPasswordInput')?.value || '',
      bypass: (document.getElementById('netProxyBypassInput')?.value || '').trim()
    };

    await persistStore('settings');
    document.getElementById('networkModal')?.classList.add('hidden');
    renderNetworkStatusIndicators();

    const sslStatus = net.ignoreCertErrors ? 'Erros de certificado SSL ignorados' : 'Verificação estrita de certificado SSL ativada';
    const proxyStatus = net.proxy.enabled && net.proxy.host
      ? `Proxy ativo (${net.proxy.protocol}://${net.proxy.host}:${net.proxy.port})`
      : 'Sem Proxy';
    document.getElementById('statusMessage').textContent = `Configurações salvas: ${sslStatus} • ${proxyStatus}.`;
  });

  // Collections & History Actions
  document.getElementById('btnNewCollection').addEventListener('click', async () => {
    const newCol = {
      id: uid('col'),
      name: `Collection ${state.collections.length + 1}`,
      items: []
    };
    state.collections.push(newCol);
    state.renamingCollectionId = newCol.id;
    await persistStore('collections');
    renderSidebar();
  });

  async function clearActiveRequestHistory() {
    const tab = getActiveTab();
    if (!tab) return;
    tab.history = [];
    await syncTabBackToCollectionItem(tab);
    await saveSessionState();
    renderAll();
    document.getElementById('statusMessage').textContent = `Histórico individual de "${tab.name || 'Requisição'}" limpo.`;
  }

  document.getElementById('btnClearHistory')?.addEventListener('click', clearActiveRequestHistory);
  document.getElementById('btnClearReqHistoryInline')?.addEventListener('click', clearActiveRequestHistory);

  document.getElementById('btnExportRequestOvo')?.addEventListener('click', () => {
    exportRequestAsOvo(getActiveTab());
  });

  // Salvar Requisição na Collection (se já estiver vinculada a uma Collection, atualiza direto; senão abre modal)
  document.getElementById('btnSaveToCollection').addEventListener('click', async () => {
    const tab = getActiveTab();
    if (tab && tab.collectionId && tab.collectionItemId) {
      await syncTabBackToCollectionItem(tab);
      document.getElementById('statusMessage').textContent = `Alterações salvas na Collection!`;
      renderSidebar();
      return;
    }
    const sel = document.getElementById('saveCollectionSelect');
    sel.innerHTML = '';
    state.collections.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      sel.appendChild(opt);
    });
    document.getElementById('newCollectionNameInput').value = '';
    document.getElementById('saveFolderNameInput').value = tab?.folder || '';
    document.getElementById('saveModal').classList.remove('hidden');
  });

  document.getElementById('btnCloseSaveModal').addEventListener('click', () => {
    document.getElementById('saveModal').classList.add('hidden');
  });

  document.getElementById('btnConfirmSaveCollection').addEventListener('click', async () => {
    const tab = getActiveTab();
    if (!tab) return;
    const newColName = document.getElementById('newCollectionNameInput').value.trim();
    const folderName = document.getElementById('saveFolderNameInput').value.trim();
    tab.folder = folderName;

    let targetCol = null;
    if (newColName) {
      targetCol = { id: uid('col'), name: newColName, items: [] };
      state.collections.push(targetCol);
    } else {
      const colId = document.getElementById('saveCollectionSelect').value;
      targetCol = state.collections.find((c) => c.id === colId);
      if (!targetCol) {
        targetCol = { id: uid('col'), name: 'Minhas Requisições', items: [] };
        state.collections.push(targetCol);
      }
    }

    const newReqId = uid('req');
    targetCol.items.push({
      id: newReqId,
      name: tab.name || tab.url,
      folder: folderName,
      method: tab.method,
      url: tab.url,
      params: structuredClone(tab.params),
      headers: structuredClone(tab.headers),
      auth: structuredClone(tab.auth),
      body: structuredClone(tab.body),
      assertions: structuredClone(tab.assertions),
      captures: structuredClone(tab.captures),
      preDbQueries: Array.isArray(tab.preDbQueries) ? structuredClone(tab.preDbQueries) : [],
      postDbQueries: Array.isArray(tab.postDbQueries) ? structuredClone(tab.postDbQueries) : [],
      preRequestScript: tab.preRequestScript || '',
      postResponseScript: tab.postResponseScript || '',
      history: Array.isArray(tab.history) ? structuredClone(tab.history) : []
    });
    tab.collectionId = targetCol.id;
    tab.collectionItemId = newReqId;

    await persistStore('collections');
    await saveSessionState();
    document.getElementById('saveModal').classList.add('hidden');
    document.getElementById('statusMessage').textContent = `Salvo em "${targetCol.name}"${folderName ? ` / ${folderName}` : ''}.`;
    renderSidebar();
  });

  // Modal Importar (.ovo / cURL / OpenAPI / Postman v2.1 / Bruno .bru)
  document.getElementById('btnOpenImportModal').addEventListener('click', () => {
    document.getElementById('importTextarea').value = '';
    document.getElementById('importModal').classList.remove('hidden');
  });

  document.getElementById('btnCloseImportModal').addEventListener('click', () => {
    document.getElementById('importModal').classList.add('hidden');
  });

  document.getElementById('importFileInput').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      document.getElementById('importTextarea').value = String(reader.result || '');
    };
    reader.readAsText(file);
  });

  document.getElementById('btnConfirmImport').addEventListener('click', async () => {
    const raw = document.getElementById('importTextarea').value.trim();
    if (!raw) return;

    // 0. Arquivo Nativo .ovo (Ovo Frito: Request, Collection ou Workspace Completo)
    const ovoParsed = parseOvoFile(raw);
    if (ovoParsed) {
      if (ovoParsed.kind === 'workspace') {
        if (ovoParsed.collections.length > 0) state.collections.push(...ovoParsed.collections);
        if (ovoParsed.environments.length > 0) state.environments.push(...ovoParsed.environments);
        await persistStore('collections');
        await persistStore('environments');
        document.getElementById('importModal').classList.add('hidden');
        document.getElementById('statusMessage').textContent = `Workspace nativo .ovo importado (${ovoParsed.collections.length} Collections e ${ovoParsed.environments.length} Environments)!`;
        renderAll();
        return;
      }
      if (ovoParsed.kind === 'request') {
        state.tabs.push(ovoParsed.tab);
        state.activeTabId = ovoParsed.tab.id;
        await saveSessionState();
        document.getElementById('importModal').classList.add('hidden');
        document.getElementById('statusMessage').textContent = `Arquivo nativo .ovo ("${ovoParsed.tab.name}") importado em nova aba!`;
        renderAll();
        return;
      }
      if (ovoParsed.kind === 'collection') {
        state.collections.push(ovoParsed.collection);
        await persistStore('collections');
        document.getElementById('importModal').classList.add('hidden');
        document.getElementById('statusMessage').textContent = `Collection nativa .ovo "${ovoParsed.collection.name}" (${ovoParsed.collection.items.length} requisições) importada!`;
        renderAll();
        return;
      }
    }

    // 1. Comando cURL
    if (/^curl(\.exe)?\s+/i.test(raw)) {
      const newTab = parseCurlCommand(raw);
      if (newTab) {
        state.tabs.push(newTab);
        state.activeTabId = newTab.id;
        await saveSessionState();
        document.getElementById('importModal').classList.add('hidden');
        document.getElementById('statusMessage').textContent = 'Comando cURL importado em nova aba!';
        renderAll();
        return;
      }
    }

    // 2. Arquivo .bru (Bruno)
    const bruTab = parseBruFile(raw);
    if (bruTab) {
      state.tabs.push(bruTab);
      state.activeTabId = bruTab.id;
      await saveSessionState();
      document.getElementById('importModal').classList.add('hidden');
      document.getElementById('statusMessage').textContent = `Arquivo Bruno (.bru) "${bruTab.name}" importado em nova aba!`;
      renderAll();
      return;
    }

    // 3. OpenAPI 3.0 / Swagger 2.0 JSON, Postman v2.1 ou Collection JSON
    try {
      const parsed = JSON.parse(raw);
      if (parsed.openapi || parsed.swagger || parsed.paths) {
        const col = convertOpenApiToCarteiro(parsed);
        state.collections.push(col);
        await persistStore('collections');
        document.getElementById('importModal').classList.add('hidden');
        document.getElementById('statusMessage').textContent = `Especificação OpenAPI "${col.name}" (${col.items.length} endpoints) importada!`;
        renderAll();
      } else if (Array.isArray(parsed.item) || parsed.info?.schema?.includes('getpostman')) {
        const col = convertPostmanCollectionToCarteiro(parsed);
        state.collections.push(col);
        await persistStore('collections');
        document.getElementById('importModal').classList.add('hidden');
        document.getElementById('statusMessage').textContent = `Collection Postman "${col.name}" (${col.items.length} requisições) importada!`;
        renderAll();
      } else if (Array.isArray(parsed.items) && parsed.name) {
        state.collections.push({ ...parsed, id: uid('col') });
        await persistStore('collections');
        document.getElementById('importModal').classList.add('hidden');
        document.getElementById('statusMessage').textContent = `Collection "${parsed.name}" importada!`;
        renderAll();
      } else {
        document.getElementById('statusMessage').textContent = 'Formato JSON não reconhecido.';
      }
    } catch {
      document.getElementById('statusMessage').textContent = 'Entrada inválida: informe arquivo .ovo, cURL, .bru (Bruno), OpenAPI 3.0 ou JSON Postman v2.1.';
    }
  });

  // Modal Codegen + Exportador .ovo e .bru
  function updateCodegenPreview() {
    const lang = document.getElementById('codegenLangSelect').value;
    document.getElementById('codegenOutputPre').textContent = generateCodeSnippet(getActiveTab(), lang);
  }

  document.getElementById('btnOpenCodeModal').addEventListener('click', () => {
    updateCodegenPreview();
    document.getElementById('codeModal').classList.remove('hidden');
  });

  document.getElementById('codegenLangSelect').addEventListener('change', updateCodegenPreview);

  document.getElementById('btnCloseCodeModal').addEventListener('click', () => {
    document.getElementById('codeModal').classList.add('hidden');
  });

  document.getElementById('btnCopyCodegen').addEventListener('click', () => {
    const code = document.getElementById('codegenOutputPre').textContent || '';
    navigator.clipboard.writeText(code);
    document.getElementById('statusMessage').textContent = 'Conteúdo copiado para a área de transferência!';
  });

  document.getElementById('btnDownloadOvoFile')?.addEventListener('click', () => {
    exportRequestAsOvo(getActiveTab());
  });

  document.getElementById('btnDownloadBruFile').addEventListener('click', () => {
    const tab = getActiveTab();
    if (!tab) return;
    const bruContent = generateBruContent(tab);
    const blob = new Blob([bruContent], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(tab.name || 'request').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.bru`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  renderAll();

  window.CDO = window.CDO || {};
  window.CDO.hookBus = window.CDO.hookBus || window.CDO.hooks.createHookBus();
  window.CDO.app = {
    state,
    ipc: IPC,
    isElectron: Boolean(window.pm && window.pm.sdk && window.pm.sdk.IPC),
    getActiveTab,
    getActiveEnvironment,
    createBlankTab,
    renderAll,
    renderSidebar,
    renderResponse,
    persistStore,
    saveSessionState,
    interpolateVariables,
    isVariableDefined,
    executeTabRequestObject,
    sendActiveRequest,
    resolveEffectiveTabAuth,
    ensureNetworkSettings,
    formatBytes
  };
  window.CDO.hookBus.emit('app:ready', { state });
}

window.addEventListener('DOMContentLoaded', init);

