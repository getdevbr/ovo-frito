
function createBlankTab(overrides = {}) {
  const defaultBody = { mode: 'none', raw: '', graphqlQuery: '', graphqlVars: '{\n  \n}', urlencoded: [], formdata: [] };
  const mergedBody = overrides.body ? { ...defaultBody, ...structuredClone(overrides.body) } : defaultBody;
  if (!Array.isArray(mergedBody.urlencoded)) mergedBody.urlencoded = [];
  if (!Array.isArray(mergedBody.formdata)) mergedBody.formdata = [];

  const defaultAuth = {
    type: 'none',
    token: '',
    username: '',
    password: '',
    keyName: '',
    keyValue: '',
    addTo: 'header',
    autoRefresh: true,
    grantType: 'client_credentials',
    tokenUrl: '',
    clientId: '',
    clientSecret: '',
    authorizationUrl: '',
    scopes: '',
    redirectPort: '',
    accessKey: '',
    secretKey: '',
    region: 'us-east-1',
    service: 'execute-api',
    sessionToken: ''
  };

  return {
    id: uid('tab'),
    pinned: Boolean(overrides.pinned),
    collectionId: overrides.collectionId || null,
    collectionItemId: overrides.collectionItemId || overrides.id || null,
    name: overrides.name || 'Nova Requisição',
    folder: overrides.folder || '',
    method: overrides.method || 'GET',
    url: overrides.url || 'https://jsonplaceholder.typicode.com/posts?_limit=3',
    params: overrides.params ? structuredClone(overrides.params) : [{ key: '_limit', value: '3', enabled: true }],
    pathVars: Array.isArray(overrides.pathVars) ? structuredClone(overrides.pathVars) : [],
    headers: overrides.headers ? structuredClone(overrides.headers) : [{ key: 'Accept', value: 'application/json', enabled: true }],
    auth: overrides.auth ? { ...defaultAuth, ...structuredClone(overrides.auth) } : defaultAuth,
    body: mergedBody,
    followRedirects: overrides.followRedirects !== false,
    maxRedirects: Number.isFinite(Number(overrides.maxRedirects)) ? Number(overrides.maxRedirects) : 10,
    baselineResponse: overrides.baselineResponse ? structuredClone(overrides.baselineResponse) : null,
    ignoreDiffPaths: overrides.ignoreDiffPaths || '',
    assertions: overrides.assertions
      ? structuredClone(overrides.assertions)
      : [{ source: 'status', operator: '==', target: '200', enabled: true }],
    captures: overrides.captures ? structuredClone(overrides.captures) : [],
    preDbQueries: Array.isArray(overrides.preDbQueries) ? structuredClone(overrides.preDbQueries) : [],
    postDbQueries: Array.isArray(overrides.postDbQueries) ? structuredClone(overrides.postDbQueries) : [],
    preRequestScript: overrides.preRequestScript || '',
    postResponseScript: overrides.postResponseScript || '',
    scriptConsoleLogs: Array.isArray(overrides.scriptConsoleLogs) ? structuredClone(overrides.scriptConsoleLogs) : [],
    history: Array.isArray(overrides.history) ? structuredClone(overrides.history) : [],
    response: overrides.response || null,
    testResults: overrides.testResults || null,
    loading: false
  };
}


function getActiveTab() {
  return state.tabs.find((t) => t.id === state.activeTabId) || null;
}


/* Renderização da Barra de Abas + Menu "Fixar / Duplicar / Fechar todas / Todas menos essa / À direita / À esquerda" */
let contextMenuTargetTabId = null;


function sortTabsWithPinnedFirst() {
  const pinned = state.tabs.filter((t) => t.pinned);
  const unpinned = state.tabs.filter((t) => !t.pinned);
  state.tabs = [...pinned, ...unpinned];
}


function openTabsContextMenu(tabId, clientX = null, clientY = null) {
  const menu = document.getElementById('tabsContextMenu');
  const titleEl = document.getElementById('tabsContextMenuTitle');
  const pinBtn = document.getElementById('btnContextPinTab');
  if (!menu) return;

  contextMenuTargetTabId = tabId || state.activeTabId;
  const targetTab = state.tabs.find((t) => t.id === contextMenuTargetTabId);
  if (titleEl && targetTab) {
    titleEl.textContent = `Aba: ${targetTab.name || targetTab.url || 'Sem título'}`;
  }
  if (pinBtn && targetTab) {
    pinBtn.textContent = targetTab.pinned ? '📌 Desafixar esta aba' : '📌 Fixar esta aba';
  }

  menu.classList.remove('hidden');
  if (clientX !== null && clientY !== null) {
    const barRect = document.querySelector('.tabs-bar')?.getBoundingClientRect();
    if (barRect) {
      const leftOffset = Math.min(Math.max(4, clientX - barRect.left), Math.max(4, barRect.width - 225));
      menu.style.left = `${leftOffset}px`;
      menu.style.right = 'auto';
      menu.style.top = '36px';
    }
  } else {
    menu.style.left = 'auto';
    menu.style.right = '6px';
    menu.style.top = '36px';
  }
}


function isTabDirty(tab) {
  if (!tab || !tab.collectionId || !tab.collectionItemId) return false;
  const col = state.collections.find((c) => c.id === tab.collectionId);
  const item = (col?.items || []).find((it) => it.id === tab.collectionItemId);
  if (!item) return false;
  return (
    (tab.name || '') !== (item.name || '') ||
    (tab.method || 'GET') !== (item.method || 'GET') ||
    (tab.url || '') !== (item.url || '') ||
    JSON.stringify(tab.headers || []) !== JSON.stringify(item.headers || []) ||
    JSON.stringify(tab.body || {}) !== JSON.stringify(item.body || {})
  );
}


function executeBulkTabClose(action, refTabId = contextMenuTargetTabId || state.activeTabId) {
  const idx = state.tabs.findIndex((t) => t.id === refTabId);
  if (action === 'toggle-pin' && idx !== -1) {
    state.tabs[idx].pinned = !state.tabs[idx].pinned;
    sortTabsWithPinnedFirst();
  } else if (action === 'duplicate' && idx !== -1) {
    const src = state.tabs[idx];
    const copy = createBlankTab({
      ...structuredClone(src),
      id: uid('tab'),
      pinned: false,
      collectionId: null,
      collectionItemId: null,
      name: `${src.name || 'Requisição'} (Cópia)`
    });
    state.tabs.splice(idx + 1, 0, copy);
    state.activeTabId = copy.id;
  } else if (action === 'close-all') {
    const pinnedTabs = state.tabs.filter((t) => t.pinned);
    if (pinnedTabs.length > 0) {
      state.tabs = pinnedTabs;
      if (!state.tabs.some((t) => t.id === state.activeTabId)) {
        state.activeTabId = state.tabs[0].id;
      }
    } else {
      const blank = createBlankTab();
      state.tabs = [blank];
      state.activeTabId = blank.id;
    }
  } else if (action === 'close-others' && idx !== -1) {
    const keep = state.tabs[idx];
    state.tabs = state.tabs.filter((t) => t.pinned || t.id === keep.id);
    state.activeTabId = keep.id;
  } else if (action === 'close-right' && idx !== -1) {
    state.tabs = state.tabs.filter((t, i) => i <= idx || t.pinned);
    if (!state.tabs.some((t) => t.id === state.activeTabId)) {
      state.activeTabId = state.tabs[state.tabs.length - 1].id;
    }
  } else if (action === 'close-left' && idx !== -1) {
    state.tabs = state.tabs.filter((t, i) => i >= idx || t.pinned);
    if (!state.tabs.some((t) => t.id === state.activeTabId)) {
      state.activeTabId = state.tabs[0].id;
    }
  }

  document.getElementById('tabsContextMenu')?.classList.add('hidden');
  saveSessionState();
  renderAll();
}


function renderTabsBar() {
  const container = document.getElementById('requestTabs');
  container.innerHTML = '';

  state.tabs.forEach((tab) => {
    const el = document.createElement('div');
    el.className = `req-tab ${tab.id === state.activeTabId ? 'active' : ''}`;
    if (tab.pinned) {
      el.style.borderBottom = '2px solid var(--accent)';
    }
    el.title = tab.pinned
      ? '📌 Aba fixada • Clique com botão direito para desafixar ou duplicar'
      : 'Clique para focar • Botão direito para fixar, duplicar ou fechar abas';
    el.addEventListener('click', () => {
      state.activeTabId = tab.id;
      renderAll();
      emitAppHook('tab:activated', { tabId: tab.id });
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openTabsContextMenu(tab.id, e.clientX, e.clientY);
    });

    const badge = document.createElement('span');
    badge.className = `method-badge method-${tab.method}`;
    badge.textContent = tab.method;

    const title = document.createElement('span');
    title.className = 'req-tab-title';
    const pinPrefix = tab.pinned ? '📌 ' : '';
    const dirtyPrefix = isTabDirty(tab) ? '● ' : '';
    title.textContent = `${pinPrefix}${dirtyPrefix}${tab.name || tab.url || 'Sem título'}`;

    el.appendChild(badge);
    el.appendChild(title);

    if (!tab.pinned && state.tabs.length > 1) {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'req-tab-close';
      closeBtn.textContent = '✕';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeTab(tab.id);
      });
      el.appendChild(closeBtn);
    }
    container.appendChild(el);
  });
}


function closeTab(tabId) {
  const idx = state.tabs.findIndex((t) => t.id === tabId);
  if (idx === -1) return;
  if (state.tabs[idx].pinned) {
    document.getElementById('statusMessage').textContent = '📌 Esta aba está fixada. Clique com o botão direito na aba para desafixá-la antes de fechar.';
    return;
  }
  state.tabs.splice(idx, 1);
  if (state.tabs.length === 0) {
    const blank = createBlankTab();
    state.tabs.push(blank);
    state.activeTabId = blank.id;
  } else if (state.activeTabId === tabId) {
    state.activeTabId = state.tabs[Math.max(0, idx - 1)].id;
  }
  saveSessionState();
  renderAll();
  emitAppHook('tab:closed', { tabId });
}


function updateUrlInterpolatedPreview(tab = getActiveTab()) {
  const bar = document.getElementById('urlInterpolatedPreviewBar');
  const txt = document.getElementById('urlInterpolatedPreviewText');
  const lockEl = document.getElementById('urlSecurityLockIndicator');
  if (!bar || !txt || !tab) return;

  const rawUrl = tab.url || '';
  const hasVars = rawUrl.includes('{{');
  const profile = getActiveProfile();
  const confirmLock = isActiveProfileConfirmDestructive(profile);

  if (!hasVars && !confirmLock) {
    bar.classList.add('hidden');
    return;
  }

  bar.classList.remove('hidden');
  if (hasVars) {
    const resolvedRaw = interpolateVariables(rawUrl);
    const hasVaultRefs = /\{\{\s*vault\.[^}]+\}\}/.test(resolvedRaw);
    const resolved = resolvedRaw.replace(/\{\{\s*vault\.[^}]+\}\}/g, '••••');
    const unresolvedMatch = resolved.match(/\{\{[^}]+\}\}/);
    const vaultBadge = hasVaultRefs ? ' <span class="badge">vault</span>' : '';
    txt.innerHTML = unresolvedMatch
      ? `🔗 Preview URL: <span style="color:var(--text-primary);">${escapeHtml(resolved)}</span>${vaultBadge} <span style="color:#ef4444; margin-left:6px;">(⚠️ Variável ${escapeHtml(unresolvedMatch[0])} não definida no Profile/Collection)</span>`
      : `🔗 Preview URL: <span style="color:#10b981;">${escapeHtml(resolved)}</span>${vaultBadge}`;
  } else {
    txt.textContent = `🔗 URL: ${rawUrl}`;
  }

  if (lockEl) {
    lockEl.classList.toggle('hidden', !confirmLock);
  }
}


function renderVarAutocompletePopover(filterTerm = '') {
  const pop = document.getElementById('varAutocompletePopover');
  const urlInput = document.getElementById('reqUrl');
  if (!pop || !urlInput) return;

  const vars = getAllAvailableVariables();
  const q = filterTerm.toLowerCase().trim();
  const filtered = vars.filter((v) => !q || v.key.toLowerCase().includes(q) || v.scope.toLowerCase().includes(q));

  pop.innerHTML = `<div class="disposition-section-title">Variáveis Disponíveis (Clique para inserir na URL)</div>`;
  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-hint';
    empty.textContent = 'Nenhuma variável encontrada neste Profile / Collection.';
    pop.appendChild(empty);
    return;
  }

  filtered.forEach((v) => {
    const item = document.createElement('div');
    item.className = 'tree-item';
    item.style.justifyContent = 'space-between';
    item.innerHTML = `
      <span><strong style="color:var(--accent); font-family:var(--font-mono);">{{${escapeHtml(v.key)}}}</strong> <span style="font-size:11px; color:var(--text-secondary);">= ${escapeHtml(v.value || '(vazio)')}</span></span>
      <span class="badge" style="white-space:nowrap; flex-shrink:0;">${escapeHtml(v.scope)}</span>
    `;
    item.addEventListener('click', () => {
      const tab = getActiveTab();
      if (!tab) return;
      const curVal = urlInput.value || '';
      const openIdx = curVal.lastIndexOf('{{');
      const closeIdx = curVal.lastIndexOf('}}');
      if (openIdx !== -1 && openIdx > closeIdx) {
        urlInput.value = `${curVal.slice(0, openIdx)}{{${v.key}}}`;
      } else {
        urlInput.value = `${curVal}{{${v.key}}}`;
      }
      tab.url = urlInput.value;
      syncParamsFromUrl(tab);
      updateUrlInterpolatedPreview(tab);
      pop.classList.add('hidden');
      urlInput.focus();
    });
    pop.appendChild(item);
  });
}

(function (root) {
  const api = {
    createBlankTab,
    getActiveTab,
    renderTabsBar,
    closeTab,
    openTabsContextMenu,
    executeBulkTabClose,
    sortTabsWithPinnedFirst,
    isTabDirty,
    updateUrlInterpolatedPreview,
    renderVarAutocompletePopover
  };
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.core = root.CDO.core || {};
    root.CDO.core.tabs = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

