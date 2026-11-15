
/* Sincronização entre Query Params e URL */
function syncUrlFromParams(tab) {
  if (!tab) return;
  const baseUrl = (tab.url || '').split('?')[0];
  const enabledParams = (tab.params || []).filter((p) => p.enabled !== false && p.key.trim() !== '');
  if (enabledParams.length === 0) {
    tab.url = baseUrl;
  } else {
    const queryStr = enabledParams
      .map((p) => `${encodeURIComponent(p.key.trim())}=${encodeURIComponent(p.value ?? '')}`)
      .join('&');
    tab.url = `${baseUrl}?${queryStr}`;
  }
  const urlInput = typeof document !== 'undefined' ? document.getElementById('reqUrl') : null;
  if (urlInput) urlInput.value = tab.url;
}


function syncParamsFromUrl(tab) {
  if (!tab) return;
  const parts = (tab.url || '').split('?');
  if (parts.length < 2) {
    tab.params = [];
    return;
  }
  const query = parts.slice(1).join('?');
  const pairs = query.split('&').filter(Boolean);
  tab.params = pairs.map((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return { key: decodeURIComponent(pair), value: '', enabled: true };
    return {
      key: decodeURIComponent(pair.slice(0, idx)),
      value: decodeURIComponent(pair.slice(idx + 1)),
      enabled: true
    };
  });
}


/* Renderização de Tabelas Key-Value */
// U-08: pilhas de desfazer por tabela key/value (Params, Headers, Forms, Assertions)
const kvUndoStacks = new Map();
function kvStack(containerId) {
  if (!kvUndoStacks.has(containerId)) {
    kvUndoStacks.set(containerId, window.CDO?.undoStack?.createUndoStack
      ? window.CDO.undoStack.createUndoStack({ limit: 50 })
      : { push() {}, undo: () => undefined, redo: () => undefined, canUndo: () => false, canRedo: () => false });
  }
  return kvUndoStacks.get(containerId);
}
function kvSnapshot(rows) {
  try { return JSON.parse(JSON.stringify(rows || [])); } catch { return []; }
}
function kvRestore(containerId, rows, snapshot, onChange) {
  rows.length = 0;
  (snapshot || []).forEach((r) => rows.push(r));
  renderKeyValueTable(containerId, rows, onChange);
  onChange?.();
}


function syncKvVarState(input) {
  const vr = window.CDO?.varResolution;
  if (!vr?.findRefs || !input) return;
  const refs = vr.findRefs(input.value || '');
  const missingKeys = refs
    .filter((r) => r.kind !== 'vault')
    .filter((r) => { try { return !isVariableDefined(r.key); } catch { return true; } })
    .map((r) => r.key);
  input.classList.toggle('var-missing-input', missingKeys.length > 0);
  input.title = missingKeys.length
    ? `Variáveis não resolvidas: ${[...new Set(missingKeys)].join(', ')}`
    : '';
}


function kvPushEdit(containerId, rows, beforeRows, onChange) {
  const stack = kvStack(containerId);
  stack.push({ before: kvSnapshot(beforeRows), after: kvSnapshot(rows) });
}


function renderKeyValueTable(containerId, rows, onChange, placeholders = { key: 'Chave (Key)', value: 'Valor (Value — suporta {{var}})' }) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  if (!container.dataset.kvUndoBound) {
    container.dataset.kvUndoBound = '1';
    container.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = String(e.key || '').toLowerCase();
      if (k !== 'z' && k !== 'y') return;
      const stack = kvStack(containerId);
      const isRedo = k === 'y' || e.shiftKey;
      const entry = isRedo ? stack.redo() : stack.undo();
      if (!entry) return;
      e.preventDefault();
      e.stopPropagation();
      kvRestore(containerId, rows, isRedo ? entry.after : entry.before, onChange);
    });
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-hint';
    empty.textContent = 'Nenhum item configurado.';
    container.appendChild(empty);
    return;
  }

  rows.forEach((row, index) => {
    const div = document.createElement('div');
    div.className = 'kv-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = row.enabled !== false;
    checkbox.addEventListener('change', () => {
      row.enabled = checkbox.checked;
      onChange();
    });

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.className = 'kv-input';
    keyInput.placeholder = placeholders.key;
    keyInput.value = row.key || '';
    keyInput.addEventListener('focusin', () => {
      if (!keyInput.dataset.kvBefore) keyInput.dataset.kvBefore = JSON.stringify(kvSnapshot(rows));
    });
    keyInput.addEventListener('input', () => {
      row.key = keyInput.value;
      syncKvVarState(keyInput);
      onChange();
    });
    keyInput.addEventListener('change', () => {
      const before = keyInput.dataset.kvBefore ? JSON.parse(keyInput.dataset.kvBefore) : kvSnapshot(rows);
      delete keyInput.dataset.kvBefore;
      kvPushEdit(containerId, rows, before, onChange);
    });
    syncKvVarState(keyInput);

    const valInput = document.createElement('input');
    valInput.type = 'text';
    valInput.className = 'kv-input';
    valInput.placeholder = placeholders.value;
    valInput.value = row.value || '';
    valInput.addEventListener('focusin', () => {
      if (!valInput.dataset.kvBefore) valInput.dataset.kvBefore = JSON.stringify(kvSnapshot(rows));
    });
    valInput.addEventListener('input', () => {
      row.value = valInput.value;
      syncKvVarState(valInput);
      onChange();
    });
    valInput.addEventListener('change', () => {
      const before = valInput.dataset.kvBefore ? JSON.parse(valInput.dataset.kvBefore) : kvSnapshot(rows);
      delete valInput.dataset.kvBefore;
      kvPushEdit(containerId, rows, before, onChange);
    });
    syncKvVarState(valInput);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-icon';
    delBtn.textContent = '✕';
    delBtn.title = 'Remover linha';
    delBtn.addEventListener('click', () => {
      const before = kvSnapshot(rows);
      rows.splice(index, 1);
      kvPushEdit(containerId, rows, before, onChange);
      renderKeyValueTable(containerId, rows, onChange, placeholders);
      onChange();
    });

    div.appendChild(checkbox);
    div.appendChild(keyInput);
    div.appendChild(valInput);
    div.appendChild(delBtn);
    container.appendChild(div);
  });
}


/* Tabela de Variáveis do Environment (com suporte a 🔒 Secret) */
function renderEnvVarsTable(rows) {
  const container = document.getElementById('envVarsTable');
  container.innerHTML = '';

  if (!Array.isArray(rows) || rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-hint';
    empty.textContent = 'Nenhuma variável configurada neste Environment.';
    container.appendChild(empty);
    return;
  }

  rows.forEach((row, index) => {
    const div = document.createElement('div');
    div.className = 'env-var-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = row.enabled !== false;
    checkbox.addEventListener('change', () => {
      row.enabled = checkbox.checked;
    });

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.className = 'kv-input';
    keyInput.placeholder = 'Nome da variável (ex: api_token)';
    keyInput.value = row.key || '';
    keyInput.addEventListener('input', () => {
      row.key = keyInput.value;
    });

    const valInput = document.createElement('input');
    valInput.type = row.secret ? 'password' : 'text';
    valInput.className = 'kv-input';
    valInput.placeholder = 'Valor';
    valInput.value = row.value || '';
    valInput.addEventListener('input', () => {
      row.value = valInput.value;
    });

    const secretLabel = document.createElement('label');
    secretLabel.style.fontSize = '11px';
    secretLabel.style.display = 'inline-flex';
    secretLabel.style.alignItems = 'center';
    secretLabel.style.gap = '4px';
    secretLabel.style.cursor = 'pointer';
    const secretChk = document.createElement('input');
    secretChk.type = 'checkbox';
    secretChk.checked = !!row.secret;
    secretChk.addEventListener('change', () => {
      row.secret = secretChk.checked;
      valInput.type = row.secret ? 'password' : 'text';
    });
    secretLabel.appendChild(secretChk);
    secretLabel.appendChild(document.createTextNode('🔒 Secret'));

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-icon';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => {
      rows.splice(index, 1);
      renderEnvVarsTable(rows);
    });

    div.appendChild(checkbox);
    div.appendChild(keyInput);
    div.appendChild(valInput);
    div.appendChild(secretLabel);
    div.appendChild(delBtn);
    container.appendChild(div);
  });
}


/* Tabela Multipart Form-Data (Texto + Upload de Arquivos Locais) */
function renderMultipartTable(tab) {
  const container = document.getElementById('formdataTable');
  container.innerHTML = '';
  if (!Array.isArray(tab.body.formdata)) tab.body.formdata = [];

  if (tab.body.formdata.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-hint';
    empty.textContent = 'Nenhum campo multipart configurado.';
    container.appendChild(empty);
    return;
  }

  tab.body.formdata.forEach((row, index) => {
    const div = document.createElement('div');
    div.className = 'multipart-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = row.enabled !== false;
    checkbox.addEventListener('change', () => {
      row.enabled = checkbox.checked;
    });

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.className = 'kv-input';
    keyInput.placeholder = 'Nome do campo';
    keyInput.value = row.key || '';
    keyInput.addEventListener('input', () => {
      row.key = keyInput.value;
    });

    const typeSelect = document.createElement('select');
    typeSelect.className = 'select-input';
    [
      { v: 'text', l: 'Texto' },
      { v: 'file', l: 'Arquivo' }
    ].forEach((it) => {
      const opt = document.createElement('option');
      opt.value = it.v;
      opt.textContent = it.l;
      if ((row.type || 'text') === it.v) opt.selected = true;
      typeSelect.appendChild(opt);
    });
    typeSelect.addEventListener('change', () => {
      row.type = typeSelect.value;
      renderMultipartTable(tab);
    });

    const valWrap = document.createElement('div');
    if (row.type === 'file') {
      const fileLabel = document.createElement('label');
      fileLabel.className = 'btn-small w-full';
      fileLabel.style.display = 'inline-block';
      fileLabel.style.cursor = 'pointer';
      fileLabel.textContent = row.fileName ? `📎 ${row.fileName}` : '📂 Escolher Arquivo Local...';
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.className = 'hidden';
      fileInput.addEventListener('change', (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result || '');
          const commaIdx = dataUrl.indexOf(',');
          row.fileName = f.name;
          row.fileContentType = f.type || 'application/octet-stream';
          row.fileBase64 = commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : '';
          renderMultipartTable(tab);
        };
        reader.readAsDataURL(f);
      });
      fileLabel.appendChild(fileInput);
      valWrap.appendChild(fileLabel);
    } else {
      const valInput = document.createElement('input');
      valInput.type = 'text';
      valInput.className = 'kv-input';
      valInput.placeholder = 'Valor (suporta {{var}})';
      valInput.value = row.value || '';
      valInput.addEventListener('input', () => {
        row.value = valInput.value;
      });
      valWrap.appendChild(valInput);
    }

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-icon';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => {
      tab.body.formdata.splice(index, 1);
      renderMultipartTable(tab);
    });

    div.appendChild(checkbox);
    div.appendChild(keyInput);
    div.appendChild(typeSelect);
    div.appendChild(valWrap);
    div.appendChild(delBtn);
    container.appendChild(div);
  });
}


function renderAssertionsTable(tab) {
  const container = document.getElementById('assertionsTable');
  container.innerHTML = '';
  if (!Array.isArray(tab.assertions)) tab.assertions = [];

  if (tab.assertions.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-hint';
    empty.textContent = 'Nenhuma assertion configurada.';
    container.appendChild(empty);
    return;
  }

  tab.assertions.forEach((row, index) => {
    const div = document.createElement('div');
    div.className = 'assertion-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = row.enabled !== false;
    checkbox.addEventListener('change', () => {
      row.enabled = checkbox.checked;
      renderActiveBadges(tab);
    });

    const srcInput = document.createElement('input');
    srcInput.type = 'text';
    srcInput.className = 'kv-input';
    srcInput.placeholder = 'status | timeMs | json.id | dbResult.rows[0].name | dbResult.rowCount | header.content-type';
    srcInput.value = row.source || '';
    srcInput.addEventListener('input', () => {
      row.source = srcInput.value;
      renderActiveBadges(tab);
    });

    const opSelect = document.createElement('select');
    opSelect.className = 'select-input';
    ['==', '!=', '<', '<=', '>', 'contains', 'exists'].forEach((op) => {
      const opt = document.createElement('option');
      opt.value = op;
      opt.textContent = op;
      if (row.operator === op) opt.selected = true;
      opSelect.appendChild(opt);
    });
    opSelect.addEventListener('change', () => {
      row.operator = opSelect.value;
    });

    const targetInput = document.createElement('input');
    targetInput.type = 'text';
    targetInput.className = 'kv-input';
    targetInput.placeholder = 'Valor esperado (ex: 200)';
    targetInput.value = row.target ?? '';
    targetInput.addEventListener('input', () => {
      row.target = targetInput.value;
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-icon';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => {
      tab.assertions.splice(index, 1);
      renderAssertionsTable(tab);
      renderActiveBadges(tab);
    });

    div.appendChild(checkbox);
    div.appendChild(srcInput);
    div.appendChild(opSelect);
    div.appendChild(targetInput);
    div.appendChild(delBtn);
    container.appendChild(div);
  });
}


function renderDbQueriesTable(containerId, rows, phase, tab) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  if (!Array.isArray(rows) || rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-hint';
    empty.textContent =
      phase === 'prerequest'
        ? 'Nenhuma query SQL pré-request configurada.'
        : 'Nenhuma query SQL pós-request configurada.';
    container.appendChild(empty);
    return;
  }

  rows.forEach((row, index) => {
    const card = document.createElement('div');
    card.style.cssText =
      'border:1px solid var(--border-color); border-radius:6px; padding:8px; margin-bottom:8px; background:rgba(15,23,42,0.35); display:flex; flex-direction:column; gap:6px;';

    const topRow = document.createElement('div');
    topRow.style.cssText = 'display:grid; grid-template-columns:22px 1fr 1fr 28px; gap:6px; align-items:center;';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = row.enabled !== false;
    checkbox.addEventListener('change', () => {
      row.enabled = checkbox.checked;
      renderActiveBadges(tab);
    });

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'kv-input';
    nameInput.placeholder = phase === 'prerequest' ? 'Alias (ex: seed_user)' : 'Alias (ex: check_user)';
    nameInput.value = row.name || '';
    nameInput.addEventListener('input', () => {
      row.name = nameInput.value;
    });

    const paramsInput = document.createElement('input');
    paramsInput.type = 'text';
    paramsInput.className = 'kv-input';
    paramsInput.placeholder =
      phase === 'prerequest'
        ? 'Params $1, $2 (ex: [{{tenant_id}}, "ativo"])'
        : 'Params $1, $2 (ex: [response.body.id] ou [json.id])';
    paramsInput.value = Array.isArray(row.params) ? JSON.stringify(row.params) : (row.params ?? '');
    paramsInput.addEventListener('input', () => {
      row.params = paramsInput.value;
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-icon';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => {
      rows.splice(index, 1);
      renderDbQueriesTable(containerId, rows, phase, tab);
      renderActiveBadges(tab);
    });

    topRow.appendChild(checkbox);
    topRow.appendChild(nameInput);
    topRow.appendChild(paramsInput);
    topRow.appendChild(delBtn);

    const sqlTextarea = document.createElement('textarea');
    sqlTextarea.className = 'code-textarea';
    sqlTextarea.rows = 2;
    sqlTextarea.style.cssText = 'min-height:48px; font-family:var(--font-mono, monospace); font-size:12px;';
    sqlTextarea.placeholder =
      phase === 'prerequest'
        ? 'SELECT id, email FROM users WHERE status = $1 LIMIT 1'
        : 'SELECT id, name, email FROM users WHERE id = $1';
    sqlTextarea.value = row.query || '';
    sqlTextarea.addEventListener('input', () => {
      row.query = sqlTextarea.value;
      renderActiveBadges(tab);
    });

    const capturesInput = document.createElement('input');
    capturesInput.type = 'text';
    capturesInput.className = 'kv-input';
    capturesInput.placeholder =
      'Capturar para {{variavel}} (ex: rows[0].id -> user_id, rows[0].email -> user_email)';
    capturesInput.value = typeof row.captures === 'string' ? row.captures : '';
    capturesInput.addEventListener('input', () => {
      row.captures = capturesInput.value;
    });

    card.appendChild(topRow);
    card.appendChild(sqlTextarea);
    card.appendChild(capturesInput);
    container.appendChild(card);
  });
}


function resolveEffectiveTabAuth(tab) {
  if (!tab) return { type: 'none' };
  const authType = tab.auth?.type || 'none';
  if (authType === 'inherit') {
    if (tab.collectionId) {
      const col = state.collections.find((c) => c.id === tab.collectionId);
      if (col && col.auth && col.auth.type && col.auth.type !== 'none') {
        return { ...col.auth, inheritedFromCollection: col.name };
      }
    }
    return { type: 'none', inheritedFromCollection: null };
  }
  return tab.auth || { type: 'none' };
}


function decodeBase64UrlUtf8(part) {
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const binary = atob(b64 + pad);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}


function decodeJwtTokenOffline(rawTokenInput) {
  if (!rawTokenInput || typeof rawTokenInput !== 'string') return null;
  const resolved = interpolateVariables(rawTokenInput.trim()).replace(/^Bearer\s+/i, '').trim();
  const parts = resolved.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1]) return null;
  try {
    const header = JSON.parse(decodeBase64UrlUtf8(parts[0]));
    const payload = JSON.parse(decodeBase64UrlUtf8(parts[1]));
    if (!header || typeof header !== 'object' || !payload || typeof payload !== 'object') return null;
    return { header, payload, rawResolved: resolved };
  } catch {
    return null;
  }
}


function renderJwtInspector(tab) {
  const box = document.getElementById('jwtInspectorBox');
  const statusBadge = document.getElementById('jwtStatusBadge');
  const headerPre = document.getElementById('jwtHeaderPre');
  const payloadPre = document.getElementById('jwtPayloadPre');
  if (!box || !statusBadge || !headerPre || !payloadPre || !tab) return;

  const effectiveAuth = resolveEffectiveTabAuth(tab);
  const effectiveType = effectiveAuth?.type || 'none';
  if (!['bearer', 'oauth2'].includes(effectiveType)) {
    box.classList.add('hidden');
    return;
  }

  const decoded = decodeJwtTokenOffline(effectiveAuth.token || '');
  if (!decoded) {
    box.classList.add('hidden');
    return;
  }

  box.classList.remove('hidden');
  headerPre.textContent = JSON.stringify(decoded.header, null, 2);

  const enrichedPayload = { ...decoded.payload };
  if (typeof decoded.payload.iat === 'number') {
    enrichedPayload._iat_human = new Date(decoded.payload.iat * 1000).toLocaleString('pt-BR');
  }
  if (typeof decoded.payload.exp === 'number') {
    enrichedPayload._exp_human = new Date(decoded.payload.exp * 1000).toLocaleString('pt-BR');
  }
  payloadPre.textContent = JSON.stringify(enrichedPayload, null, 2);

  if (typeof decoded.payload.exp === 'number') {
    const nowSec = Math.floor(Date.now() / 1000);
    const diffSec = decoded.payload.exp - nowSec;
    if (diffSec > 0) {
      const mins = Math.ceil(diffSec / 60);
      statusBadge.className = 'test-badge-pass';
      statusBadge.textContent = mins > 120
        ? `✅ JWT Válido (expira em ${Math.round(mins / 60)}h)`
        : `✅ JWT Válido (expira em ${mins} min)`;
    } else {
      const minsAgo = Math.ceil(Math.abs(diffSec) / 60);
      statusBadge.className = 'test-badge-fail';
      statusBadge.textContent = minsAgo > 120
        ? `⚠️ JWT Expirado há ${Math.round(minsAgo / 60)}h`
        : `⚠️ JWT Expirado há ${minsAgo} min`;
    }
  } else {
    statusBadge.className = 'badge';
    statusBadge.textContent = 'ℹ️ JWT decodificado (sem claim exp)';
  }
}


function buildVarScopes() {
  const scopes = [];
  const tab = getActiveTab();
  if (tab && tab.collectionId) {
    const col = state.collections.find((c) => c.id === tab.collectionId);
    if (col) scopes.push({ name: `Collection: ${col.name}`, vars: col.variables || [] });
  }
  const env = getActiveEnvironment();
  if (env) scopes.push({ name: `Environment: ${env.name}`, vars: env.variables || [] });
  if (state.runnerIterationVars && typeof state.runnerIterationVars === 'object') {
    scopes.push({
      name: 'Runner',
      vars: Object.entries(state.runnerIterationVars).map(([key, value]) => ({ key, value: String(value ?? ''), enabled: true }))
    });
  }
  return scopes;
}


function varChainTitle(key) {
  const vr = window.CDO?.varResolution;
  if (!vr?.resolveChain) return null;
  const res = vr.resolveChain(key, buildVarScopes());
  if (!res.chain || !res.chain.length) return null;
  const parts = res.chain.map((c) => `${c.scope}: ${c.defined ? (c.secret ? '••••' : 'definida') : '—'}`);
  return `Precedência → ${parts.join(' | ')}`;
}


function varStatusClassifier(key) {
  try {
    const vr = window.CDO?.varResolution;
    const k = String(key || '').trim();
    const kind = vr?.kindOf ? vr.kindOf(k) : 'var';
    if (kind === 'vault') {
      return { verdict: 'vault', title: 'Segredo do cofre — resolvido somente no processo principal' };
    }
    const defined = isVariableDefined(k);
    if (!defined) {
      return { verdict: 'missing', title: varChainTitle(k) || `Variável {{${k}}} não definida em nenhum escopo` };
    }
    if (kind === 'dynamic') return { verdict: 'dynamic', title: 'Variável dinâmica — gerada a cada envio' };
    if (kind === 'chain') return { verdict: 'chain', title: 'Referência a resposta de outra request (@...)' };
    if (vr?.resolveChain) {
      const res = vr.resolveChain(k, buildVarScopes());
      if (res.secret) return { verdict: 'secret', title: `Variável secreta definida em ${res.source || 'escopo'} (valor mascarado)` };
      if (res.source) return { verdict: 'ok', title: `Resolvida via ${res.source}` };
    }
    return { verdict: 'ok', title: 'Resolvida' };
  } catch {
    return null;
  }
}

function syncUrlVarHighlight() {
  const wrap = document.querySelector('.url-input-wrap');
  const pre = document.getElementById('urlHighlightLayer');
  const input = document.getElementById('reqUrl');
  if (!wrap || !pre || !input) return;
  const hl = window.CDO?.jsonHighlight;
  const value = input.value || '';
  const hasVars = value.includes('{{');
  wrap.classList.toggle('vars-active', hasVars);
  if (!hasVars) {
    pre.innerHTML = '';
    return;
  }
  pre.innerHTML = hl?.highlightVars ? hl.highlightVars(value, varStatusClassifier) : escapeHtml(value);
  pre.scrollLeft = input.scrollLeft;
}


/* Renderização do Editor da Requisição Ativa */
function syncJsonEditor() {
  const wrap = document.getElementById('jsonEditorWrap');
  const pre = document.getElementById('bodyJsonHighlight');
  const ta = document.getElementById('bodyRawInput');
  const err = document.getElementById('bodyJsonError');
  if (!wrap || !pre || !ta) return;
  const tab = getActiveTab();
  const bodyMode = tab?.body?.mode || 'none';
  const isJson = bodyMode === 'json';
  const isRaw = bodyMode === 'raw';
  const hl = window.CDO?.jsonHighlight;
  const value = ta.value || '';

  if (!isJson && !isRaw) {
    wrap.classList.remove('json-active');
    if (err) err.classList.add('hidden');
    return;
  }
  wrap.classList.add('json-active');

  if (isJson) {
    pre.innerHTML = hl
      ? hl.highlightJson(value, { varClassifier: varStatusClassifier })
      : hl?.highlightVars?.(value, varStatusClassifier) || escapeHtml(value);
    if (err) {
      const invalid = value.trim().length > 0 && hl ? !hl.isValidJson(value) : false;
      err.classList.toggle('hidden', !invalid);
    }
  } else {
    pre.innerHTML = hl?.highlightVars ? hl.highlightVars(value, varStatusClassifier) : escapeHtml(value);
    if (err) err.classList.add('hidden');
  }
}


function renderActiveRequest() {
  const tab = getActiveTab();
  if (!tab) return;

  if (!Array.isArray(tab.assertions)) tab.assertions = [{ source: 'status', operator: '==', target: '200', enabled: true }];
  if (!Array.isArray(tab.captures)) tab.captures = [];
  if (!Array.isArray(tab.preDbQueries)) tab.preDbQueries = [];
  if (!Array.isArray(tab.postDbQueries)) tab.postDbQueries = [];

  document.getElementById('reqNameInput').value = tab.name || '';
  const reqMethodEl = document.getElementById('reqMethod');
  reqMethodEl.value = tab.method || 'GET';
  reqMethodEl.dataset.method = tab.method || 'GET';
  document.getElementById('reqUrl').value = tab.url || '';
  syncUrlVarHighlight();
  updateUrlInterpolatedPreview(tab);

  const btnSend = document.getElementById('btnSend');
  btnSend.disabled = !!tab.loading;
  btnSend.textContent = tab.loading ? 'Sending...' : 'Send';

  renderActiveBadges(tab);

  renderKeyValueTable('paramsTable', tab.params, () => {
    syncUrlFromParams(tab);
    renderActiveBadges(tab);
  });

  renderKeyValueTable('headersTable', tab.headers, () => {
    renderActiveBadges(tab);
  });

  // Auth
  const authType = tab.auth?.type || 'none';
  document.getElementById('authType').value = authType;
  document.getElementById('authInheritPane')?.classList.toggle('hidden', authType !== 'inherit');
  document.getElementById('authBearerPane').classList.toggle('hidden', authType !== 'bearer');
  document.getElementById('authBasicPane').classList.toggle('hidden', authType !== 'basic');
  document.getElementById('authApiKeyPane').classList.toggle('hidden', authType !== 'apikey');
  document.getElementById('authOAuth2Pane').classList.toggle('hidden', authType !== 'oauth2');
  document.getElementById('authDigestPane')?.classList.toggle('hidden', authType !== 'digest');
  document.getElementById('authAwsPane')?.classList.toggle('hidden', authType !== 'aws_sigv4');
  document.getElementById('authChainBox').classList.toggle('hidden', !['bearer', 'apikey', 'oauth2'].includes(authType));

  if (authType === 'inherit') {
    const inheritSummary = document.getElementById('authInheritSummaryText');
    const col = tab.collectionId ? state.collections.find((c) => c.id === tab.collectionId) : null;
    if (inheritSummary) {
      if (!col) {
        inheritSummary.textContent = '⚠️ Salve esta requisição em uma Collection primeiro para herdar a autenticação da Collection.';
      } else if (!col.auth || !col.auth.type || col.auth.type === 'none') {
        inheritSummary.textContent = `ℹ️ A Collection "${col.name}" está com No Auth. Clique ao lado para configurar o Auth padrão da Collection.`;
      } else {
        const typeLabels = { bearer: 'Bearer Token', basic: 'Basic Auth', apikey: `API Key (${col.auth.keyName || 'X-API-Key'})` };
        inheritSummary.textContent = `✅ Herdando ${typeLabels[col.auth.type] || col.auth.type} da Collection "${col.name}".`;
      }
    }
  }

  document.getElementById('authBearerToken').value = tab.auth?.token || '';
  document.getElementById('authBasicUser').value = tab.auth?.username || '';
  document.getElementById('authBasicPass').value = tab.auth?.password || '';
  document.getElementById('authApiKeyName').value = tab.auth?.keyName || '';
  document.getElementById('authApiKeyValue').value = tab.auth?.keyValue || '';
  document.getElementById('authApiKeyAddTo').value = tab.auth?.addTo || 'header';
  const oauthGrant = tab.auth?.grantType || 'client_credentials';
  document.getElementById('oauthGrantType').value = oauthGrant;
  document.getElementById('oauthTokenUrl').value = tab.auth?.tokenUrl || '';
  document.getElementById('oauthClientId').value = tab.auth?.clientId || '';
  document.getElementById('oauthClientSecret').value = tab.auth?.clientSecret || '';
  document.getElementById('oauthAuthorizationUrl').value = tab.auth?.authorizationUrl || '';
  document.getElementById('oauthScopes').value = tab.auth?.scopes || '';
  document.getElementById('oauthRedirectPort').value = tab.auth?.redirectPort || '';
  const oauthUserEl = document.getElementById('oauthUsername');
  const oauthPassEl = document.getElementById('oauthPassword');
  if (oauthUserEl) oauthUserEl.value = tab.auth?.username || '';
  if (oauthPassEl) oauthPassEl.value = tab.auth?.password || '';
  const oauthAutoEl = document.getElementById('oauthAutoRefresh');
  if (oauthAutoEl) oauthAutoEl.checked = tab.auth?.autoRefresh === true;
  document.getElementById('oauthPkceFields')?.classList.toggle('hidden', oauthGrant !== 'authorization_code');
  const oauthPwFields = document.getElementById('oauthPasswordFields');
  if (oauthPwFields) {
    oauthPwFields.classList.toggle('hidden', oauthGrant !== 'password');
    oauthPwFields.style.display = oauthGrant === 'password' ? '' : 'none';
  }
  document.getElementById('oauthAccessTokenInput').value = tab.auth?.token || '';
  const digestUserEl = document.getElementById('authDigestUser');
  const digestPassEl = document.getElementById('authDigestPass');
  if (digestUserEl) digestUserEl.value = tab.auth?.username || '';
  if (digestPassEl) digestPassEl.value = tab.auth?.password || '';
  const awsAccessEl = document.getElementById('authAwsAccessKey');
  const awsSecretEl = document.getElementById('authAwsSecretKey');
  const awsRegionEl = document.getElementById('authAwsRegion');
  const awsServiceEl = document.getElementById('authAwsService');
  const awsSessionEl = document.getElementById('authAwsSessionToken');
  if (awsAccessEl) awsAccessEl.value = tab.auth?.accessKey || '';
  if (awsSecretEl) awsSecretEl.value = tab.auth?.secretKey || '';
  if (awsRegionEl) awsRegionEl.value = tab.auth?.region || 'us-east-1';
  if (awsServiceEl) awsServiceEl.value = tab.auth?.service || 'execute-api';
  if (awsSessionEl) awsSessionEl.value = tab.auth?.sessionToken || '';

  if (['bearer', 'apikey', 'oauth2'].includes(authType)) {
    renderAuthChainBox(tab);
  }
  renderJwtInspector(tab);

  // Body
  const bodyMode = tab.body?.mode || 'none';
  document.querySelectorAll('input[name="bodyMode"]').forEach((r) => {
    r.checked = r.value === bodyMode;
  });
  document.getElementById('bodyNoneWrap').classList.toggle('hidden', bodyMode !== 'none');
  document.getElementById('bodyRawWrap').classList.toggle('hidden', !(bodyMode === 'json' || bodyMode === 'raw'));
  document.getElementById('bodyGraphqlWrap').classList.toggle('hidden', bodyMode !== 'graphql');
  document.getElementById('bodyUrlEncodedWrap').classList.toggle('hidden', bodyMode !== 'urlencoded');
  document.getElementById('bodyFormDataWrap').classList.toggle('hidden', bodyMode !== 'formdata');
  document.getElementById('btnBeautifyJson').classList.toggle('hidden', bodyMode !== 'json');
  document.getElementById('bodyRawInput').value = tab.body?.raw || '';
  syncJsonEditor();
  document.getElementById('graphqlQueryInput').value = tab.body?.graphqlQuery || '';
  document.getElementById('graphqlVarsInput').value = tab.body?.graphqlVars || '{\n  \n}';

  if (bodyMode === 'urlencoded') {
    if (!Array.isArray(tab.body.urlencoded)) tab.body.urlencoded = [];
    renderKeyValueTable('urlencodedTable', tab.body.urlencoded, () => {});
  } else if (bodyMode === 'formdata') {
    renderMultipartTable(tab);
  }

  // Scripts (pm.*)
  document.getElementById('preRequestScriptInput').value = tab.preRequestScript || '';
  document.getElementById('postResponseScriptInput').value = tab.postResponseScript || '';

  // Database (SQL) Pre & Post
  renderDbQueriesTable('preDbQueriesList', tab.preDbQueries, 'prerequest', tab);
  renderDbQueriesTable('postDbQueriesList', tab.postDbQueries, 'test', tab);

  // Tests & Captura
  renderAssertionsTable(tab);
  renderKeyValueTable(
    'capturesTable',
    tab.captures,
    () => renderActiveBadges(tab),
    { key: 'Origem (ex: json.id ou header.x-token)', value: 'Variável destino (ex: post_id)' }
  );

  renderResponse(tab);
}


function renderActiveBadges(tab) {
  const activeParamsCount = (tab.params || []).filter((p) => p.enabled !== false && p.key).length;
  document.getElementById('badgeParams').textContent = activeParamsCount > 0 ? `(${activeParamsCount})` : '';
  const activeHeadersCount = (tab.headers || []).filter((h) => h.enabled !== false && h.key).length;
  document.getElementById('badgeHeaders').textContent = activeHeadersCount > 0 ? `(${activeHeadersCount})` : '';
  document.getElementById('badgeBody').classList.toggle('visible', tab.body && tab.body.mode !== 'none');

  const testsCount =
    (tab.assertions || []).filter((a) => a.enabled !== false && a.source).length +
    (tab.captures || []).filter((c) => c.enabled !== false && c.key && c.value).length;
  document.getElementById('badgeTests').textContent = testsCount > 0 ? `(${testsCount})` : '';

  const jarCount = (state.cookies || []).length;
  document.getElementById('badgeCookieJar').textContent = jarCount > 0 ? `(${jarCount})` : '';

  const hasScripts = !!(tab.preRequestScript?.trim() || tab.postResponseScript?.trim());
  document.getElementById('badgeScripts')?.classList.toggle('visible', hasScripts);

  const dbQueriesCount =
    (tab.preDbQueries || []).filter((q) => q && q.enabled !== false && String(q.query || '').trim()).length +
    (tab.postDbQueries || []).filter((q) => q && q.enabled !== false && String(q.query || '').trim()).length;
  const badgeDb = document.getElementById('badgeDb');
  if (badgeDb) {
    badgeDb.textContent = dbQueriesCount > 0 ? `(${dbQueriesCount})` : '';
  }
}


function extractJsonCandidatePaths(obj, prefix = 'json', out = [], depth = 0) {
  if (depth > 3 || obj === null || obj === undefined || out.length >= 25) return out;
  if (Array.isArray(obj)) {
    if (obj.length > 0) {
      extractJsonCandidatePaths(obj[0], `${prefix}.0`, out, depth + 1);
    }
    return out;
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      const nextPath = `${prefix}.${k}`;
      if (v !== null && typeof v === 'object') {
        extractJsonCandidatePaths(v, nextPath, out, depth + 1);
      } else {
        out.push({ path: nextPath, value: String(v) });
      }
    }
  }
  return out;
}


function getAvailableChainSources(currentTabId) {
  const sources = [];
  const seenNames = new Set();

  if (state.sessions?.responseCache?.__last?.response) {
    sources.push({
      ref: 'last',
      label: `⚡ Última executada (${state.sessions.responseCache.__last.name || 'Sessão'})`,
      response: state.sessions.responseCache.__last.response
    });
  }

  for (const t of state.tabs) {
    if (t.id !== currentTabId && t.response && t.response.ok) {
      const name = (t.name || t.url || t.id).trim();
      seenNames.add(name.toLowerCase());
      sources.push({
        ref: name,
        label: `📑 Aba: ${name} (${t.method})`,
        response: t.response
      });
    }
  }

  const cache = state.sessions?.responseCache || {};
  for (const [k, entry] of Object.entries(cache)) {
    if (k === '__last' || !entry?.response) continue;
    if (!seenNames.has(k.toLowerCase())) {
      seenNames.add(k.toLowerCase());
      sources.push({
        ref: k,
        label: `💾 Sessão salva: ${entry.name || k} (${entry.method || 'HTTP'})`,
        response: entry.response
      });
    }
  }

  for (const t of state.tabs) {
    const name = (t.name || t.url || t.id).trim();
    if (t.id !== currentTabId && !seenNames.has(name.toLowerCase())) {
      seenNames.add(name.toLowerCase());
      sources.push({
        ref: name,
        label: `📑 Aba (sem execução ainda): ${name}`,
        response: null
      });
    }
  }

  return sources;
}


function renderAuthChainBox(tab) {
  const reqSelect = document.getElementById('chainSourceReqSelect');
  const fieldSelect = document.getElementById('chainSourceFieldSelect');
  const previewEl = document.getElementById('chainPreviewValue');
  if (!reqSelect || !fieldSelect) return;

  const sources = getAvailableChainSources(tab.id);
  const prevSelectedRef = reqSelect.value;
  reqSelect.innerHTML = '';

  if (sources.length === 0) {
    const opt = document.createElement('option');
    opt.value = 'Login';
    opt.textContent = 'Execute uma request (ex: Login / Criar Post) para listar respostas';
    reqSelect.appendChild(opt);
  } else {
    sources.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.ref;
      opt.textContent = s.label;
      if (s.ref === prevSelectedRef) opt.selected = true;
      reqSelect.appendChild(opt);
    });
  }

  function populateFieldsForSelectedSource() {
    const selectedRef = reqSelect.value || 'last';
    const srcObj = sources.find((s) => s.ref === selectedRef);
    const res = srcObj?.response || findCachedResponseByRequestRef(selectedRef);
    fieldSelect.innerHTML = '';

    const candidates = [];
    if (res && res.body) {
      try {
        const parsed = JSON.parse(res.body);
        extractJsonCandidatePaths(parsed, 'json', candidates);
      } catch {}
    }

    candidates.sort((a, b) => {
      const score = (p) => (/token|jwt|auth|key|secret|id/i.test(p) ? 0 : 1);
      return score(a.path) - score(b.path);
    });

    if (candidates.length === 0) {
      [
        { path: 'json.token', value: 'padrão JWT/Bearer' },
        { path: 'json.access_token', value: 'padrão OAuth2' },
        { path: 'json.data.token', value: 'envelope data' },
        { path: 'json.id', value: 'ID do recurso' },
        { path: 'header.authorization', value: 'Header Authorization' }
      ].forEach((c) => candidates.push(c));
    }

    candidates.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.path;
      const shortVal = String(c.value ?? '').slice(0, 36);
      opt.textContent = `${c.path} (${shortVal})`;
      fieldSelect.appendChild(opt);
    });

    updateChainPreview();
  }

  function updateChainPreview() {
    const expr = `{{@${reqSelect.value || 'last'}.${fieldSelect.value || 'json.token'}}}`;
    const resolved = interpolateVariables(expr);
    if (resolved !== expr) {
      previewEl.textContent = `✓ Valor atual: ${resolved.slice(0, 42)}`;
    } else {
      previewEl.textContent = `Expressão: ${expr}`;
    }
  }

  reqSelect.onchange = populateFieldsForSelectedSource;
  fieldSelect.onchange = updateChainPreview;
  populateFieldsForSelectedSource();
}

(function (root) {
  const api = {
    syncUrlFromParams,
    syncParamsFromUrl,
    renderKeyValueTable,
    renderEnvVarsTable,
    renderMultipartTable,
    renderAssertionsTable,
    renderDbQueriesTable,
    renderActiveRequest,
    renderActiveBadges,
    renderAuthChainBox,
    resolveEffectiveTabAuth,
    decodeJwtTokenOffline,
    renderJwtInspector,
    extractJsonCandidatePaths,
    getAvailableChainSources
  };
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.core = root.CDO.core || {};
    root.CDO.core.requestEditor = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

