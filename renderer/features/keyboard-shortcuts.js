(function () {
  'use strict';

  const sc = window.CDO?.shortcuts;
  const reg = window.CDO?.commands;
  if (!sc || !reg) return;

  const app = () => window.CDO.app;

  function isEditableTarget(el) {
    if (!el || el === document.body) return false;
    const tag = (el.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable === true;
  }

  function activateTabById(tabId) {
    const a = app();
    if (!a || !tabId) return;
    a.state.activeTabId = tabId;
    a.renderAll();
    a.saveSessionState();
  }

  function cycleTab(delta) {
    const a = app();
    if (!a || !a.state.tabs.length) return;
    const i = a.state.tabs.findIndex((t) => t.id === a.state.activeTabId);
    const next = a.state.tabs[(i + delta + a.state.tabs.length) % a.state.tabs.length];
    activateTabById(next.id);
  }

  function gotoTab(n) {
    const a = app();
    const t = a?.state.tabs[n - 1];
    if (t) activateTabById(t.id);
  }

  function newTab() {
    const a = app();
    if (!a) return;
    const t = a.createBlankTab();
    a.state.tabs.push(t);
    activateTabById(t.id);
  }

  function saveActive() {
    document.getElementById('btnSaveToCollection')?.click();
  }

  function focusUrl() {
    const el = document.getElementById('reqUrl');
    if (!el) return;
    el.focus();
    el.select?.();
  }

  function duplicateActive() {
    const a = app();
    const tab = a?.getActiveTab?.();
    if (a && tab) a.executeBulkTabClose('duplicate', tab.id);
  }

  function beautifyBody() {
    const a = app();
    const tab = a?.getActiveTab?.();
    if (!tab || !tab.body || !tab.body.raw) return;
    try {
      tab.body.raw = JSON.stringify(JSON.parse(tab.body.raw), null, 2);
      const el = document.getElementById('bodyRawInput');
      if (el) el.value = tab.body.raw;
    } catch {
      const s = document.getElementById('statusMessage');
      if (s) s.textContent = 'JSON inválido para formatação.';
    }
  }

  function toggleSidebar() {
    const a = app();
    if (!a?.state.settings?.layout) return;
    const layout = a.state.settings.layout;
    layout.sidebarCollapsed = !layout.sidebarCollapsed;
    a.applyLayoutState(layout);
    a.saveLayoutPrefs(layout);
  }

  function switchEnv() {
    app()?.openProfileModal?.();
  }

  const COMMANDS = [
    { id: 'request.send', title: 'Enviar request', category: 'Request', defaultKeys: 'Ctrl+Enter', run: () => app()?.sendActiveRequest?.() },
    { id: 'request.save', title: 'Salvar na Collection', category: 'Request', defaultKeys: 'Ctrl+S', run: saveActive },
    { id: 'request.focusUrl', title: 'Focar campo URL', category: 'Request', defaultKeys: 'Ctrl+L', run: focusUrl },
    { id: 'request.duplicate', title: 'Duplicar request', category: 'Request', defaultKeys: 'Ctrl+D', run: duplicateActive },
    { id: 'request.beautify', title: 'Beautify JSON do body', category: 'Request', defaultKeys: 'Ctrl+Shift+F', run: beautifyBody },
    { id: 'tab.new', title: 'Nova aba', category: 'Abas', defaultKeys: 'Ctrl+T', run: newTab },
    { id: 'tab.close', title: 'Fechar aba', category: 'Abas', defaultKeys: 'Ctrl+W', run: () => { const a = app(); const t = a?.getActiveTab?.(); if (a && t) a.closeTab(t.id); } },
    { id: 'tab.next', title: 'Próxima aba', category: 'Abas', defaultKeys: 'Ctrl+Tab', run: () => cycleTab(1) },
    { id: 'tab.prev', title: 'Aba anterior', category: 'Abas', defaultKeys: 'Ctrl+Shift+Tab', run: () => cycleTab(-1) },
    { id: 'env.switch', title: 'Trocar Profile', category: 'Geral', defaultKeys: 'Ctrl+E', run: switchEnv },
    { id: 'palette.open', title: 'Command Palette', category: 'Geral', defaultKeys: 'Ctrl+K', run: () => app()?.openCommandPalette?.() },
    { id: 'shortcuts.help', title: 'Folha de atalhos', category: 'Geral', defaultKeys: 'Ctrl+/', run: () => showShortcutsHelp() },
    { id: 'layout.toggleSidebar', title: 'Alternar sidebar', category: 'Geral', defaultKeys: 'Ctrl+B', run: toggleSidebar }
  ];

  for (let n = 1; n <= 9; n++) {
    COMMANDS.push({
      id: `tab.goto.${n}`,
      title: `Ir para aba ${n}`,
      category: 'Abas',
      defaultKeys: `Ctrl+${n}`,
      run: () => gotoTab(n)
    });
  }

  // Alternativas para modo web (browser reserva Ctrl+T/Ctrl+W)
  COMMANDS.push(
    { id: 'tab.new.web', title: 'Nova aba (web)', category: 'Abas', defaultKeys: 'Alt+T', when: () => app()?.isElectron === false, run: newTab },
    { id: 'tab.close.web', title: 'Fechar aba (web)', category: 'Abas', defaultKeys: 'Alt+W', when: () => app()?.isElectron === false, run: () => { const a = app(); const t = a?.getActiveTab?.(); if (a && t) a.closeTab(t.id); } }
  );

  COMMANDS.forEach((def) => {
    try {
      reg.register({
        id: def.id,
        title: def.title,
        category: def.category,
        run: def.run,
        when: def.when,
        defaultKeys: def.defaultKeys
      });
    } catch (e) {
      console.warn('shortcut command register:', e.message);
    }
  });

  function defaultBindings() {
    const out = {};
    COMMANDS.forEach((c) => { out[c.id] = c.defaultKeys; });
    return out;
  }

  function effectiveBindings() {
    const overrides = app()?.state?.settings?.keybindings || {};
    return sc.resolveBindings(defaultBindings(), overrides);
  }

  function findCommandForEvent(e) {
    const bindings = effectiveBindings();
    for (const [id, binding] of Object.entries(bindings)) {
      if (sc.match(e, binding)) return id;
    }
    return null;
  }

  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented) return;
    const id = findCommandForEvent(e);
    if (!id) return;
    const binding = effectiveBindings()[id] || '';
    const hasCtrl = /ctrl/i.test(binding) || (app()?.isElectron !== false && e.metaKey && /mac/i.test(navigator.platform || ''));
    if (isEditableTarget(e.target) && !hasCtrl) return;
    try {
      reg.execute(id);
      e.preventDefault();
    } catch (err) {
      console.error('shortcut execute:', err);
    }
  }, true);

  // ---------- Folha de atalhos (Ctrl+/) ----------
  function showShortcutsHelp() {
    const existing = document.getElementById('shortcutsHelpModal');
    if (existing) { existing.classList.remove('hidden'); return; }
    const overlay = document.createElement('div');
    overlay.id = 'shortcutsHelpModal';
    overlay.className = 'modal-backdrop';
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-label', 'Atalhos de teclado');
    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = '<h3>⌨ Atalhos de teclado</h3>';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn-icon';
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', 'Fechar');
    header.appendChild(closeBtn);
    modal.appendChild(header);

    const body = document.createElement('div');
    body.className = 'modal-body';
    const bindings = effectiveBindings();
    const byCat = new Map();
    COMMANDS.forEach((c) => {
      const b = bindings[c.id];
      if (!b) return;
      if (!byCat.has(c.category)) byCat.set(c.category, []);
      byCat.get(c.category).push({ title: c.title, keys: b });
    });
    byCat.forEach((items, cat) => {
      const h = document.createElement('div');
      h.style.cssText = 'font-weight:600;margin:12px 0 4px;color:var(--text-secondary)';
      h.textContent = cat;
      body.appendChild(h);
      items.forEach((it) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;padding:3px 0;font-size:13px';
        const k = document.createElement('kbd');
        k.textContent = it.keys;
        k.style.cssText = 'background:var(--bg-tertiary,#333);border:1px solid var(--border,#444);border-radius:4px;padding:1px 6px;font-size:11px';
        row.appendChild(document.createTextNode(it.title));
        row.appendChild(k);
        body.appendChild(row);
      });
    });
    modal.appendChild(body);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
    });
  }

  // ---------- UI de remapeamento em Settings → Atalhos ----------
  function renderKeybindingsPane() {
    const pane = document.getElementById('cfgPane-shortcuts');
    if (!pane || pane.dataset.rendered === '1') return;
    pane.dataset.rendered = '1';
    pane.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'env-profile-config-card';
    const header = document.createElement('div');
    header.className = 'pane-header';
    header.style.marginBottom = '8px';
    header.innerHTML = '<span><strong>⌨ Atalhos de teclado</strong></span>';
    const actions = document.createElement('div');
    actions.className = 'chain-actions';
    const btnDefaults = document.createElement('button');
    btnDefaults.type = 'button';
    btnDefaults.className = 'btn-small';
    btnDefaults.textContent = 'Restaurar padrão';
    const btnClear = document.createElement('button');
    btnClear.type = 'button';
    btnClear.className = 'btn-small';
    btnClear.textContent = 'Limpar tudo';
    actions.appendChild(btnDefaults);
    actions.appendChild(btnClear);
    header.appendChild(actions);
    card.appendChild(header);

    const warn = document.createElement('div');
    warn.id = 'keybindingsConflictWarn';
    warn.style.cssText = 'display:none;color:#e67e22;font-size:12px;margin-bottom:8px';
    card.appendChild(warn);

    const list = document.createElement('div');
    list.id = 'keybindingsList';
    card.appendChild(list);
    pane.appendChild(card);

    function persist() {
      const a = app();
      if (!a?.state.settings) return Promise.resolve();
      if (!a.state.settings.keybindings || typeof a.state.settings.keybindings !== 'object') {
        a.state.settings.keybindings = {};
      }
      // grava só overrides (diferentes do default)
      const defaults = defaultBindings();
      const overrides = {};
      COMMANDS.forEach((c) => {
        const current = inputs[c.id]?.value;
        if (current === undefined) return;
        if (current && sc.canonical(current) !== defaults[c.id] && current !== defaults[c.id]) {
          overrides[c.id] = sc.canonical(current) || current;
        } else if (!current) {
          overrides[c.id] = null;
        }
      });
      a.state.settings.keybindings = overrides;
      return Promise.resolve(a.persistStore?.('settings'));
    }

    const inputs = {};
    function refreshWarn() {
      const map = {};
      COMMANDS.forEach((c) => {
        const v = inputs[c.id]?.value;
        if (v) map[c.id] = v;
      });
      const conflicts = sc.findConflicts(sc.resolveBindings(defaultBindings(), mapToOverrides()));
      warn.style.display = conflicts.length ? 'block' : 'none';
      warn.textContent = conflicts.length
        ? `Conflito: ${conflicts.map((c) => `${c.binding} (${c.commands.join(' × ')})`).join('; ')}`
        : '';
    }
    function mapToOverrides() {
      const o = {};
      COMMANDS.forEach((c) => {
        const v = inputs[c.id]?.value;
        if (v !== undefined) o[c.id] = v || null;
      });
      return o;
    }

    const byCat = new Map();
    COMMANDS.forEach((c) => {
      if (!byCat.has(c.category)) byCat.set(c.category, []);
      byCat.get(c.category).push(c);
    });
    byCat.forEach((items, cat) => {
      const h = document.createElement('div');
      h.style.cssText = 'font-weight:600;margin:10px 0 4px;color:var(--text-secondary);font-size:12px';
      h.textContent = cat;
      list.appendChild(h);
      items.forEach((c) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:3px 0;font-size:13px';
        const label = document.createElement('span');
        label.style.flex = '1';
        label.textContent = c.title;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'text-input';
        input.style.maxWidth = '140px';
        input.placeholder = 'ex: Ctrl+Shift+X';
        const current = effectiveBindings()[c.id] || '';
        input.value = current;
        input.dataset.commandId = c.id;
        input.addEventListener('keydown', (e) => {
          if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) { e.preventDefault(); return; }
          e.preventDefault();
          e.stopPropagation();
          const parts = [];
          if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
          if (e.altKey) parts.push('Alt');
          if (e.shiftKey) parts.push('Shift');
          parts.push(sc.normalizeKeyName(e.key));
          input.value = sc.format({ ctrl: parts.includes('Ctrl'), alt: parts.includes('Alt'), shift: parts.includes('Shift'), key: parts[parts.length - 1] });
          refreshWarn();
        });
        input.addEventListener('change', () => { persist(); refreshWarn(); });
        inputs[c.id] = input;
        row.appendChild(label);
        row.appendChild(input);
        list.appendChild(row);
      });
    });

    btnDefaults.addEventListener('click', () => {
      COMMANDS.forEach((c) => { if (inputs[c.id]) inputs[c.id].value = c.defaultKeys; });
      persist(); refreshWarn();
    });
    btnClear.addEventListener('click', () => {
      COMMANDS.forEach((c) => { if (inputs[c.id]) inputs[c.id].value = ''; });
      persist(); refreshWarn();
    });
    refreshWarn();
  }

  // renderiza a aba quando o modal de config abrir
  const obs = new MutationObserver(() => {
    if (!document.getElementById('networkModal')?.classList.contains('hidden')) renderKeybindingsPane();
  });
  const modalEl = document.getElementById('networkModal');
  if (modalEl) obs.observe(modalEl, { attributes: true, attributeFilter: ['class'] });
  renderKeybindingsPane();
})();
