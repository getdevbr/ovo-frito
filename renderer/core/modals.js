
/* Modal de Profile (Variáveis, Segredos .env, Contorno, DB e Travas) */
let editingProfileId = null;


function syncProfileModalControls(profile) {
  if (!profile) return;
  ensureProfileStructure(profile);
  const meta = getProfileMeta(profile);

  const contourSelect = document.getElementById('profileModalContourModeSelect');
  const colorInput = document.getElementById('profileModalBorderColorInput');
  const previewBanner = document.getElementById('envProfilePreviewBanner');
  const varsHeader = document.getElementById('envVarsPaneHeaderTitle');
  const modalTitle = document.getElementById('profileModalTitle');
  const delBtn = document.getElementById('btnDeleteProfile');

  if (modalTitle) {
    modalTitle.textContent = `🏷️ Profile "${profile.name || 'Sem nome'}" — Variáveis & Configurações`;
  }
  if (delBtn) {
    delBtn.classList.toggle('hidden', state.profiles.length <= 1);
  }

  const c = (meta.borderColor || '').toLowerCase();
  if (contourSelect) {
    contourSelect.value = c ? 'custom' : 'none';
  }

  if (colorInput) {
    colorInput.value = c || '#ef4444';
    colorInput.classList.toggle('hidden', !c);
  }

  const chkDestructive = document.getElementById('profileConfirmDestructiveCheckbox');
  if (chkDestructive) {
    chkDestructive.checked = Boolean(profile.confirmDestructive);
  }
  const chkProd = document.getElementById('profileIsProdCheckbox');
  if (chkProd) {
    chkProd.checked = Boolean(profile.isProduction);
  }

  const activeContextLabel = `Profile "${profile.name || ''}"`;

  if (previewBanner) {
    if (c) {
      previewBanner.style.borderColor = c;
      previewBanner.style.boxShadow = `0 0 12px -2px ${c}`;
      previewBanner.style.color = 'var(--text-primary)';
      previewBanner.textContent = `${meta.icon} ${activeContextLabel} — A requisição ficará contornada com a cor ${c.toUpperCase()}`;
    } else {
      previewBanner.style.borderColor = 'var(--border-color)';
      previewBanner.style.boxShadow = 'none';
      previewBanner.style.color = 'var(--text-secondary)';
      previewBanner.textContent = `${meta.icon} ${activeContextLabel} — Sem contorno customizado na requisição`;
    }
  }

  if (varsHeader) {
    varsHeader.textContent = `Variáveis do Profile "${profile.name || ''}" (marque 🔒 Secret para ocultar valores sensíveis)`;
  }

  const dbCfg = profile.database || {
    enabled: false,
    client: 'postgres',
    connectionString: '',
    host: '127.0.0.1',
    port: '5432',
    database: '',
    user: '',
    password: '',
    ssl: false
  };
  const dbEnabledEl = document.getElementById('envDbEnabledCheckbox');
  const dbClientEl = document.getElementById('envDbClientSelect');
  const dbConnStrEl = document.getElementById('envDbConnectionStringInput');
  const dbHostEl = document.getElementById('envDbHostInput');
  const dbPortEl = document.getElementById('envDbPortInput');
  const dbNameEl = document.getElementById('envDbDatabaseInput');
  const dbUserEl = document.getElementById('envDbUserInput');
  const dbPassEl = document.getElementById('envDbPasswordInput');
  const dbSslEl = document.getElementById('envDbSslCheckbox');
  const dbStatusBadge = document.getElementById('envDbTestStatusBadge');

  if (dbEnabledEl) dbEnabledEl.checked = Boolean(dbCfg.enabled);
  if (dbClientEl) dbClientEl.value = dbCfg.client || 'postgres';
  if (dbConnStrEl) dbConnStrEl.value = dbCfg.connectionString || '';
  if (dbHostEl) dbHostEl.value = dbCfg.host ?? '127.0.0.1';
  if (dbPortEl) dbPortEl.value = dbCfg.port ?? '5432';
  if (dbNameEl) dbNameEl.value = dbCfg.database || '';
  if (dbUserEl) dbUserEl.value = dbCfg.user || '';
  if (dbPassEl) dbPassEl.value = dbCfg.password || '';
  if (dbSslEl) dbSslEl.checked = Boolean(dbCfg.ssl);
  if (dbStatusBadge) dbStatusBadge.textContent = '';
}


function openProfileModal(profileId) {
  const profile = state.profiles.find((p) => p.id === profileId) || getActiveProfile();
  if (!profile) return;
  ensureProfileStructure(profile);
  editingProfileId = profile.id;
  document.getElementById('profileNameInput').value = profile.name || '';
  syncProfileModalControls(profile);
  renderEnvVarsTable(profile.variables);
  document.getElementById('profileModal').classList.remove('hidden');
}


/* Cookie Jar Modal */
function renderCookieJarModal() {
  const container = document.getElementById('cookieJarTable');
  container.innerHTML = '';

  if (!Array.isArray(state.cookies) || state.cookies.length === 0) {
    container.innerHTML = `<div class="empty-hint">Nenhum cookie armazenado no Cookie Jar local.</div>`;
    return;
  }

  state.cookies.forEach((c, idx) => {
    const row = document.createElement('div');
    row.className = 'cookie-row';

    const domInput = document.createElement('input');
    domInput.type = 'text';
    domInput.className = 'kv-input';
    domInput.placeholder = 'Domínio (ex: localhost)';
    domInput.value = c.domain || '';
    domInput.addEventListener('input', () => (c.domain = domInput.value.toLowerCase()));

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'kv-input';
    nameInput.placeholder = 'Nome do Cookie';
    nameInput.value = c.name || '';
    nameInput.addEventListener('input', () => (c.name = nameInput.value));

    const valInput = document.createElement('input');
    valInput.type = 'text';
    valInput.className = 'kv-input';
    valInput.placeholder = 'Valor';
    valInput.value = c.value || '';
    valInput.addEventListener('input', () => (c.value = valInput.value));

    const pathInput = document.createElement('input');
    pathInput.type = 'text';
    pathInput.className = 'kv-input';
    pathInput.placeholder = 'Path (/)';
    pathInput.value = c.path || '/';
    pathInput.addEventListener('input', () => (c.path = pathInput.value));

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-icon';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => {
      state.cookies.splice(idx, 1);
      renderCookieJarModal();
    });

    row.appendChild(domInput);
    row.appendChild(nameInput);
    row.appendChild(valInput);
    row.appendChild(pathInput);
    row.appendChild(delBtn);
    container.appendChild(row);
  });
}


function ensureNetworkSettings() {
  if (!state.settings || typeof state.settings !== 'object') {
    state.settings = { theme: 'dark', activeProfileId: '' };
  }
  if (state.settings.ignoreCertErrors === undefined) {
    state.settings.ignoreCertErrors = false;
  }
  if (state.settings.showTimingDetails === undefined) {
    state.settings.showTimingDetails = false;
  }
  if (!state.settings.timeoutMs) {
    state.settings.timeoutMs = 30000;
  }
  if (!state.settings.proxy || typeof state.settings.proxy !== 'object') {
    state.settings.proxy = {
      enabled: false,
      protocol: 'http',
      host: '',
      port: '8080',
      username: '',
      password: '',
      bypass: 'localhost, 127.0.0.1, ::1'
    };
  }
  if (!state.settings.mtls || typeof state.settings.mtls !== 'object') {
    state.settings.mtls = {
      enabled: false,
      fileName: '',
      certBase64: '',
      passphrase: ''
    };
  }
  return state.settings;
}


function renderNetworkStatusIndicators() {
  const net = ensureNetworkSettings();
  const topBtn = document.getElementById('btnOpenNetworkModal');
  const statusEl = document.getElementById('statusNetworkSummary');
  const proxyActive = Boolean(net.proxy?.enabled && String(net.proxy?.host || '').trim());
  const mtlsActive = Boolean(net.mtls?.enabled && net.mtls?.certBase64);
  const sslLabel = net.ignoreCertErrors ? '🔓 SSL Ignorado' : '🔒 SSL Estrito';
  const mtlsLabel = mtlsActive ? ` • 🪪 mTLS (${net.mtls.fileName})` : '';
  const proxyLabel = proxyActive ? `🌐 Proxy ${net.proxy.host}:${net.proxy.port || 8080}` : 'Sem Proxy';

  if (topBtn) {
    topBtn.textContent = proxyActive ? '⚙ Configurações (🌐 Proxy)' : '⚙ Configurações';
    topBtn.style.borderColor = proxyActive || mtlsActive ? 'var(--accent)' : '';
    topBtn.title = `Configurações • ${sslLabel}${mtlsLabel} • ${proxyLabel}`;
  }
  if (statusEl) {
    statusEl.textContent = `${sslLabel}${mtlsLabel} • ${proxyLabel}`;
  }
}


function switchNetworkConfigTab(tabName) {
  const modal = document.getElementById('networkModal');
  if (!modal) return;
  const target = tabName || 'appearance';
  modal.querySelectorAll('[data-cfg-tab]').forEach((b) => {
    const active = b.dataset.cfgTab === target;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  modal.querySelectorAll('.cfg-pane').forEach((p) => {
    p.classList.toggle('active', p.id === `cfgPane-${target}`);
  });
}


function openNetworkModal(tabName) {
  const net = ensureNetworkSettings();
  const chkCert = document.getElementById('netIgnoreCertErrorsCheckbox');
  const timeoutIn = document.getElementById('netTimeoutMsInput');
  const timingChk = document.getElementById('netShowTimingDetailsCheckbox');
  const chkMtls = document.getElementById('netMtlsEnabledCheckbox');
  const mtlsName = document.getElementById('netMtlsCertFileName');
  const mtlsPass = document.getElementById('netMtlsPassphraseInput');
  const chkProxy = document.getElementById('netProxyEnabledCheckbox');
  const protoSel = document.getElementById('netProxyProtocolSelect');
  const hostIn = document.getElementById('netProxyHostInput');
  const portIn = document.getElementById('netProxyPortInput');
  const userIn = document.getElementById('netProxyUsernameInput');
  const passIn = document.getElementById('netProxyPasswordInput');
  const bypassIn = document.getElementById('netProxyBypassInput');
  const fieldsBox = document.getElementById('netProxyFieldsContainer');

  if (chkCert) chkCert.checked = Boolean(net.ignoreCertErrors);
  if (timeoutIn) timeoutIn.value = Number(net.timeoutMs) || 30000;
  if (timingChk) timingChk.checked = Boolean(net.showTimingDetails);
  if (chkMtls) chkMtls.checked = Boolean(net.mtls?.enabled);
  if (mtlsName) mtlsName.textContent = net.mtls?.fileName || 'Nenhum certificado carregado';
  if (mtlsPass) mtlsPass.value = net.mtls?.passphrase || '';
  if (chkProxy) chkProxy.checked = Boolean(net.proxy?.enabled);
  if (protoSel) protoSel.value = net.proxy?.protocol || 'http';
  if (hostIn) hostIn.value = net.proxy?.host || '';
  if (portIn) portIn.value = net.proxy?.port || '8080';
  if (userIn) userIn.value = net.proxy?.username || '';
  if (passIn) passIn.value = net.proxy?.password || '';
  if (bypassIn) bypassIn.value = net.proxy?.bypass ?? 'localhost, 127.0.0.1, ::1';
  if (fieldsBox) {
    fieldsBox.style.opacity = chkProxy?.checked ? '1' : '0.55';
  }

  switchNetworkConfigTab(tabName);
  document.getElementById('networkModal')?.classList.remove('hidden');
}


let editingCollectionConfigId = null;


function syncCollectionConfigAuthFields(authType) {
  document.getElementById('colAuthBearerFields')?.classList.toggle('hidden', authType !== 'bearer');
  document.getElementById('colAuthBasicFields')?.classList.toggle('hidden', authType !== 'basic');
  document.getElementById('colAuthApiKeyFields')?.classList.toggle('hidden', authType !== 'apikey');
}


function openCollectionConfigModal(col) {
  if (!col) return;
  editingCollectionConfigId = col.id;
  if (!Array.isArray(col.variables)) col.variables = [];
  if (!Array.isArray(col.items)) col.items = [];
  if (!col.auth || typeof col.auth !== 'object') {
    col.auth = { type: 'none', token: '', username: '', password: '', keyName: 'X-API-Key', keyValue: '', addTo: 'header' };
  }

  document.getElementById('collectionConfigModalTitle').textContent = `📁 Configurar Collection — ${col.name}`;

  const colAuthType = col.auth.type || 'none';
  const selType = document.getElementById('colAuthTypeSelect');
  if (selType) selType.value = colAuthType;
  syncCollectionConfigAuthFields(colAuthType);

  const bearerIn = document.getElementById('colAuthBearerTokenInput');
  const basicUserIn = document.getElementById('colAuthBasicUserInput');
  const basicPassIn = document.getElementById('colAuthBasicPassInput');
  const apiKeyNameIn = document.getElementById('colAuthApiKeyNameInput');
  const apiKeyValIn = document.getElementById('colAuthApiKeyValueInput');
  const apiKeyAddToSel = document.getElementById('colAuthApiKeyAddToSelect');

  if (bearerIn) bearerIn.value = col.auth.token || '';
  if (basicUserIn) basicUserIn.value = col.auth.username || '';
  if (basicPassIn) basicPassIn.value = col.auth.password || '';
  if (apiKeyNameIn) apiKeyNameIn.value = col.auth.keyName || 'X-API-Key';
  if (apiKeyValIn) apiKeyValIn.value = col.auth.keyValue || '';
  if (apiKeyAddToSel) apiKeyAddToSel.value = col.auth.addTo || 'header';

  const foldersContainer = document.getElementById('collectionFoldersTable');
  if (foldersContainer) {
    foldersContainer.innerHTML = '';
    if (col.items.length === 0) {
      foldersContainer.innerHTML = `<div class="empty-hint">Nenhuma requisição nesta Collection ainda.</div>`;
    } else {
      col.items.forEach((it) => {
        const row = document.createElement('div');
        row.className = 'kv-row';
        row.style.gridTemplateColumns = '70px 1fr 1fr';
        const badge = document.createElement('span');
        badge.className = `method-badge method-${it.method || 'GET'}`;
        badge.textContent = it.method || 'GET';
        const nameEl = document.createElement('span');
        nameEl.style.fontSize = '12px';
        nameEl.style.overflow = 'hidden';
        nameEl.style.textOverflow = 'ellipsis';
        nameEl.style.whiteSpace = 'nowrap';
        nameEl.textContent = it.name || it.url;
        const folderIn = document.createElement('input');
        folderIn.type = 'text';
        folderIn.className = 'kv-input';
        folderIn.placeholder = 'Nome da Pasta (ex: Auth, Usuários)';
        folderIn.value = it.folder || '';
        folderIn.addEventListener('input', () => {
          it.folder = folderIn.value.trim();
        });
        row.appendChild(badge);
        row.appendChild(nameEl);
        row.appendChild(folderIn);
        foldersContainer.appendChild(row);
      });
    }
  }

  renderKeyValueTable('collectionVarsTable', col.variables, () => {}, {
    key: 'Variável da Collection (ex: service_prefix)',
    value: 'Valor (viaja no arquivo .ovo da Collection)'
  });

  document.getElementById('collectionConfigModal')?.classList.remove('hidden');
}


function getCommandPaletteActions(query = '') {
  const q = query.toLowerCase().trim();
  const actions = [];

  // 1. Todas as requisições de todas as Collections (favoritas e recentes primeiro — U-05)
  const favIds = new Set(state.settings?.favorites || []);
  const recIds = new Set(state.settings?.recents || []);
  const rankOf = (it) => (it.id && favIds.has(it.id) ? 0 : it.id && recIds.has(it.id) ? 1 : 2);
  state.collections.forEach((col) => {
    (col.items || []).forEach((it) => {
      const folderPrefix = it.folder ? `${it.folder} / ` : '';
      actions.push({
        category: `Collection: ${col.name}`,
        label: `[${it.method || 'GET'}] ${folderPrefix}${it.name || it.url}`,
        sub: it.url || '',
        _rank: rankOf(it),
        run: () => openRequestInTab(it, col.id)
      });
    });
  });

  // 2. Profiles criados pelo usuário
  (state.profiles || []).forEach((profile) => {
    const meta = getProfileMeta(profile);
    actions.push({
      category: 'Profile',
      label: `${meta.borderColor ? '🎨' : '🏷️'} Ativar Profile: ${profile.name}`,
      sub: `${(profile.variables || []).length} variáveis${meta.borderColor ? ` • Contorno ${meta.borderColor}` : ''}`,
      run: async () => {
        state.settings.activeProfileId = profile.id;
        await persistStore('profiles');
        await persistStore('settings');
        renderAll();
      }
    });
  });

  // 3. Comandos registrados no registry central (U-00)
  const registry = window.CDO?.commands;
  if (registry && typeof registry.list === 'function') {
    registry.list().forEach((cmd) => {
      actions.push({
        category: cmd.category,
        label: cmd.title,
        sub: cmd.sub || '',
        run: () => cmd.run()
      });
    });
  }

  // Ordena: favoritos → recentes → demais (estável, preserva ordem interna)
  const ordered = actions
    .map((a, i) => ({ a, i, r: a._rank ?? 2 }))
    .sort((x, y) => (x.r - y.r) || (x.i - y.i))
    .map(({ a }) => { delete a._rank; return a; });

  if (!q) return ordered;
  return ordered.filter(
    (a) =>
      a.label.toLowerCase().includes(q) ||
      a.category.toLowerCase().includes(q) ||
      (a.sub || '').toLowerCase().includes(q)
  );
}


function renderCommandPaletteList(query = '') {
  const listEl = document.getElementById('commandPaletteList');
  if (!listEl) return;
  listEl.innerHTML = '';
  const items = getCommandPaletteActions(query);
  if (items.length === 0) {
    listEl.innerHTML = `<div class="empty-hint">Nenhum comando ou requisição encontrado para "${escapeHtml(query)}".</div>`;
    return;
  }
  items.slice(0, 30).forEach((item) => {
    const row = document.createElement('div');
    row.className = 'test-result-item';
    row.style.cursor = 'pointer';
    row.style.justifyContent = 'space-between';
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(item.label)}</strong>
        <span style="color:var(--text-secondary); font-size:11px; margin-left:8px;">${escapeHtml(item.sub || '')}</span>
      </div>
      <span class="badge">${escapeHtml(item.category)}</span>
    `;
    row.addEventListener('click', () => {
      document.getElementById('commandPaletteModal')?.classList.add('hidden');
      item.run();
    });
    listEl.appendChild(row);
  });
}


function openCommandPalette() {
  const modal = document.getElementById('commandPaletteModal');
  const input = document.getElementById('commandPaletteInput');
  if (!modal || !input) return;
  input.value = '';
  renderCommandPaletteList('');
  modal.classList.remove('hidden');
  setTimeout(() => input.focus(), 20);
}


function initManualModal() {
  document.getElementById('btnOpenManualModal')?.addEventListener('click', () => {
    document.getElementById('manualModal')?.classList.remove('hidden');
  });
  const close = () => document.getElementById('manualModal')?.classList.add('hidden');
  document.getElementById('btnCloseManualModal')?.addEventListener('click', close);
  document.getElementById('btnCloseManualModalFooter')?.addEventListener('click', close);
  document.getElementById('manualModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'manualModal') close();
  });
}


function initDevToolboxModal() {
  const open = () => document.getElementById('devToolboxModal')?.classList.remove('hidden');
  const close = () => document.getElementById('devToolboxModal')?.classList.add('hidden');
  document.getElementById('btnOpenDevToolboxModal')?.addEventListener('click', open);
  document.getElementById('btnCloseDevToolboxModal')?.addEventListener('click', close);
  document.getElementById('devToolboxModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'devToolboxModal') close();
  });

  const inputEl = () => document.getElementById('toolboxInputText');
  const outputEl = () => document.getElementById('toolboxOutputText');
  const setOutput = (value) => {
    if (outputEl()) outputEl().value = value;
  };
  const utf8ToB64 = (str) => {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin);
  };
  const b64ToUtf8 = (b64) => {
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  };
  const toHex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');

  const runOp = async (op) => {
    const input = inputEl()?.value ?? '';
    try {
      if (op === 'b64-encode') return setOutput(utf8ToB64(input));
      if (op === 'b64-decode') return setOutput(b64ToUtf8(input.trim()));
      if (op === 'url-encode') return setOutput(encodeURIComponent(input));
      if (op === 'url-decode') return setOutput(decodeURIComponent(input));
      if (op === 'sha256') {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
        return setOutput(toHex(digest));
      }
      if (op === 'hmac-sha256') {
        const secret = document.getElementById('toolboxHmacSecretInput')?.value || '';
        const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input));
        return setOutput(toHex(sig));
      }
    } catch (err) {
      setOutput(`Erro: ${err.message || err}`);
    }
  };

  document.querySelectorAll('[data-toolbox-op]').forEach((btn) => {
    btn.addEventListener('click', () => runOp(btn.dataset.toolboxOp));
  });

  document.getElementById('btnCopyToolboxOutput')?.addEventListener('click', () => {
    const val = outputEl()?.value || '';
    navigator.clipboard?.writeText(val);
    document.getElementById('statusMessage') && (document.getElementById('statusMessage').textContent = 'Resultado copiado!');
  });

  const gens = window.CDO?.generatorsBr;
  const runGen = (kind) => {
    if (!gens) return;
    const map = {
      uuid: () => gens.generateUuidV4(),
      cpf: () => gens.generateRandomCpf(),
      cnpj: () => gens.generateRandomCnpj(),
      celular: () => gens.generateRandomCelular(),
      email: () => gens.generateRandomEmail()
    };
    const val = map[kind]?.();
    if (val == null) return;
    navigator.clipboard?.writeText(String(val));
    setOutput(String(val));
    const status = document.getElementById('statusMessage');
    if (status) status.textContent = 'Valor gerado e copiado!';
  };
  document.querySelectorAll('[data-toolbox-gen]').forEach((btn) => {
    btn.addEventListener('click', () => runGen(btn.dataset.toolboxGen));
  });

  const tsInput = document.getElementById('toolboxTimestampInput');
  const tsResult = document.getElementById('toolboxTimestampResult');
  const renderTs = () => {
    if (!tsInput || !tsResult) return;
    const raw = tsInput.value.trim();
    if (!raw) { tsResult.textContent = 'Informe um timestamp ou clique em "Agora"'; return; }
    const num = Number(raw);
    let date = null;
    if (Number.isFinite(num)) {
      const ms = num < 1e12 ? num * 1000 : num;
      date = new Date(ms);
      if (Number.isNaN(date.getTime())) date = null;
    } else {
      date = new Date(raw);
      if (Number.isNaN(date.getTime())) { tsResult.textContent = 'Data inválida'; return; }
    }
    tsResult.textContent = `${date.toISOString()}  |  Unix(s): ${Math.floor(date.getTime() / 1000)}`;
  };
  tsInput?.addEventListener('input', renderTs);
  document.getElementById('btnToolboxNowTimestamp')?.addEventListener('click', () => {
    if (tsInput) tsInput.value = String(Math.floor(Date.now() / 1000));
    renderTs();
  });
}


function compareContextOptions() {
  return (state.profiles || []).map((p) => ({
    value: p.id,
    label: `${getProfileMeta(p).borderColor ? '🎨' : '🏷️'} ${p.name} — ${(p.variables || []).length} vars`
  }));
}


function flattenJsonDiff(a, b, path = '', out = []) {
  if (out.length > 200) return out;
  if (typeof a !== typeof b || (a === null) !== (b === null)) {
    out.push(`${path || '(raiz)'}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
    return out;
  }
  if (a && typeof a === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    keys.forEach((k) => flattenJsonDiff(a[k], b[k], path ? `${path}.${k}` : k, out));
  } else if (a !== b) {
    out.push(`${path || '(raiz)'}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
  }
  return out;
}


async function runCompareAB() {
  const selA = document.getElementById('compareContextASelect');
  const selB = document.getElementById('compareContextBSelect');
  const metaBar = document.getElementById('compareABMetaBar');
  const outPre = document.getElementById('compareABDiffOutputPre');
  const tab = getActiveTab();
  if (!selA || !selB || !tab || selA.value === selB.value) {
    if (metaBar) metaBar.innerHTML = '<span class="empty-hint">Selecione dois contextos diferentes.</span>';
    return;
  }
  const originalProfileId = state.settings.activeProfileId;

  const runInContext = async (profileId) => {
    state.settings.activeProfileId = profileId;
    applyActiveProfileContour();
    const res = await executeTabRequestObject(tab);
    return res;
  };

  try {
    if (metaBar) metaBar.innerHTML = '<span class="empty-hint">Executando A/B...</span>';
    const [resA, resB] = [await runInContext(selA.value), await runInContext(selB.value)];
    let bodyA = resA?.body || '';
    let bodyB = resB?.body || '';
    try { bodyA = JSON.stringify(JSON.parse(bodyA), null, 2); } catch {}
    try { bodyB = JSON.stringify(JSON.parse(bodyB), null, 2); } catch {}
    let diffLines = [];
    try {
      diffLines = flattenJsonDiff(JSON.parse(resA?.body || 'null'), JSON.parse(resB?.body || 'null'));
    } catch {
      diffLines = bodyA === bodyB ? [] : ['(corpo não-JSON difere — veja Raw)'];
    }
    if (metaBar) {
      metaBar.innerHTML = `
        <span><strong>A:</strong> ${escapeHtml(resA?.status ?? 'ERR')} · ${escapeHtml(resA?.timeMs ?? '?')}ms · ${escapeHtml(selA.selectedOptions[0]?.textContent)}</span>
        <span style="margin-left:12px;"><strong>B:</strong> ${escapeHtml(resB?.status ?? 'ERR')} · ${escapeHtml(resB?.timeMs ?? '?')}ms · ${escapeHtml(selB.selectedOptions[0]?.textContent)}</span>
        <span style="margin-left:12px;"><strong>Diff:</strong> ${diffLines.length === 0 ? 'idêntico' : `${diffLines.length} diferença(s)`}</span>`;
    }
    if (outPre) {
      outPre.textContent = diffLines.length
        ? diffLines.join('\n')
        : 'Sem diferenças estruturais entre A e B.';
    }
  } catch (err) {
    if (metaBar) metaBar.innerHTML = `<span class="empty-hint">Erro na comparação: ${escapeHtml(err.message || err)}</span>`;
  } finally {
    state.settings.activeProfileId = originalProfileId;
    applyActiveProfileContour();
    renderAll();
  }
}


function initCompareProfileModal() {
  const open = () => {
    const modal = document.getElementById('compareProfileModal');
    if (!modal) return;
    const populate = (id) => {
      const sel = document.getElementById(id);
      if (!sel) return;
      sel.innerHTML = '';
      compareContextOptions().forEach((o) => {
        const opt = document.createElement('option');
        opt.value = o.value;
        opt.textContent = o.label;
        sel.appendChild(opt);
      });
    };
    populate('compareContextASelect');
    populate('compareContextBSelect');
    const opts = compareContextOptions();
    const selA = document.getElementById('compareContextASelect');
    const selB = document.getElementById('compareContextBSelect');
    if (selA && opts[1]) selA.value = opts[0].value;
    if (selB && opts[1]) selB.value = opts[1].value;
    modal.classList.remove('hidden');
  };
  const close = () => document.getElementById('compareProfileModal')?.classList.add('hidden');
  document.getElementById('btnOpenCompareProfileModal')?.addEventListener('click', open);
  document.getElementById('btnCloseCompareProfileModal')?.addEventListener('click', close);
  document.getElementById('compareProfileModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'compareProfileModal') close();
  });
  document.getElementById('btnRunCompareAB')?.addEventListener('click', runCompareAB);
}

// Registro central de comandos (U-00): fonte única para palette, atalhos e onboarding.
(function registerPaletteCommands() {
  if (typeof window === 'undefined') return;
  const reg = window.CDO?.commands;
  if (!reg || typeof reg.register !== 'function') return;
  const safe = (fn) => () => { try { return fn(); } catch (e) { console.error(e); } };
  const defs = [
    {
      id: 'action.proxyConfig',
      title: '🛡️ Configurar Proxy HTTP/HTTPS e Certificado SSL/TLS',
      category: 'Rede / Segurança',
      sub: 'Abrir modal de Rede, Proxy e rejectUnauthorized',
      run: safe(() => openNetworkModal())
    },
    {
      id: 'action.exportOvo',
      title: '🥚 Exportar Requisição Ativa como arquivo .ovo',
      category: 'Exportação Nativa',
      sub: 'Formato nativo Ovo Frito',
      run: safe(() => exportRequestAsOvo(getActiveTab()))
    },
    {
      id: 'layout.horizontal',
      title: '⬌ Disposição Lado a Lado (Request à Esquerda / Response à Direita)',
      category: 'Disposição das Janelas',
      sub: 'Layout Horizontal',
      run: safe(() => {
        state.settings.layout.splitDirection = 'horizontal';
        applyLayoutState(state.settings.layout);
        saveLayoutPrefs(state.settings.layout);
      })
    },
    {
      id: 'layout.vertical',
      title: '⬍ Disposição Empilhada (Request em Cima / Response em Baixo)',
      category: 'Disposição das Janelas',
      sub: 'Layout Vertical',
      run: safe(() => {
        state.settings.layout.splitDirection = 'vertical';
        applyLayoutState(state.settings.layout);
        saveLayoutPrefs(state.settings.layout);
      })
    },
    {
      id: 'theme.toggle',
      title: '☀ / 🌙 Alternar Tema Dark / Light',
      category: 'Aparência',
      sub: 'Trocar esquema de cores',
      run: safe(async () => {
        state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
        applyTheme(state.settings.theme);
        await persistStore('settings');
      })
    }
  ];
  defs.forEach((d) => { try { reg.register(d); } catch (e) { console.warn('command register:', e.message); } });
})();

(function (root) {
  const api = {
    editingProfileId,
    syncProfileModalControls,
    openProfileModal,
    renderCookieJarModal,
    ensureNetworkSettings,
    renderNetworkStatusIndicators,
    switchNetworkConfigTab,
    openNetworkModal,
    syncCollectionConfigAuthFields,
    openCollectionConfigModal,
    getCommandPaletteActions,
    renderCommandPaletteList,
    openCommandPalette,
    initManualModal,
    initDevToolboxModal,
    compareContextOptions,
    flattenJsonDiff,
    runCompareAB,
    initCompareProfileModal
  };
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.core = root.CDO.core || {};
    root.CDO.core.modals = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

