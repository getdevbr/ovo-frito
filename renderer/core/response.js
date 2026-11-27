
/* Renderização da Resposta */
function formatBytes(bytes) {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  return `${(bytes / 1024).toFixed(2)} KB`;
}


function formatHistoryTimestamp(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' (' + d.toLocaleDateString('pt-BR') + ')';
  } catch {
    return isoStr;
  }
}


function renderRequestHistoryPane(tab) {
  const badgeResHistory = document.getElementById('badgeResHistory');
  const titleSpan = document.getElementById('resHistoryTitleSpan');
  const listEl = document.getElementById('requestHistoryList');
  if (!listEl) return;

  if (!tab) {
    if (badgeResHistory) badgeResHistory.textContent = '';
    listEl.innerHTML = `<div class="empty-hint">Nenhuma requisição ativa.</div>`;
    return;
  }

  if (!Array.isArray(tab.history)) tab.history = [];
  const hist = tab.history;

  // U-07: filtro + modo global (todas as abas)
  const filterTerm = state.historyFilter || '';
  const globalMode = Boolean(state.historyGlobal);
  const hs = window.CDO?.historySearch;
  const matchEntry = hs ? (e) => hs.matches(e, filterTerm) : () => true;

  let items;
  if (globalMode) {
    items = [];
    (state.tabs || []).forEach((t) => {
      (Array.isArray(t.history) ? t.history : []).forEach((e, idx) => {
        if (matchEntry(e)) items.push({ entry: e, idx, ownerTab: t });
      });
    });
    items.sort((a, b) => String(b.entry.timestamp || '').localeCompare(String(a.entry.timestamp || '')));
    if (badgeResHistory) badgeResHistory.textContent = items.length ? `(${items.length} global)` : '';
    if (titleSpan) titleSpan.textContent = `🕒 Histórico Global — ${items.length} execuções em ${state.tabs.length} abas`;
  } else {
    items = hist.map((e, idx) => ({ entry: e, idx, ownerTab: tab })).filter((it) => matchEntry(it.entry));
    if (badgeResHistory) badgeResHistory.textContent = hist.length > 0 ? `(${hist.length})` : '';
    if (titleSpan) titleSpan.textContent = `🕒 Histórico Individual de "${tab.name || tab.url || 'Requisição'}" (${hist.length} execuções)`;
  }

  listEl.innerHTML = '';
  if (items.length === 0) {
    listEl.innerHTML = `<div class="empty-hint">${globalMode ? 'Nenhuma execução encontrada com esse filtro.' : `Nenhuma execução registrada para "${escapeHtml(tab.name || 'esta requisição')}" ainda. Clique em Send para registrar.`}</div>`;
    return;
  }

  items.forEach(({ entry, idx, ownerTab }) => {
    const row = document.createElement('div');
    row.className = 'test-result-item';
    const isOk = entry.status >= 200 && entry.status < 300;
    const statusBadgeClass = isOk ? 'test-badge-pass' : 'test-badge-fail';
    const statusLabel = entry.status ? `${entry.status} ${entry.statusText || ''}`.trim() : 'ERR';

    const infoSpan = document.createElement('span');
    infoSpan.style.flex = '1';
    infoSpan.innerHTML = `
      ${globalMode ? `<span style="color:var(--accent);font-size:11px;margin-right:6px;">${escapeHtml(ownerTab?.name || ownerTab?.url || 'aba')}</span>` : ''}
      <span class="${statusBadgeClass}">${escapeHtml(statusLabel)}</span>
      <span class="method-badge method-${escapeHtml(entry.method || 'GET')}" style="margin-left:6px;">${escapeHtml(entry.method || 'GET')}</span>
      <strong>${escapeHtml(entry.resolvedUrl || entry.url || '')}</strong>
      <span style="color: var(--text-secondary); margin-left: 8px;">⏱ ${entry.timeMs || 0} ms • ${formatBytes(entry.sizeBytes || 0)} • 🕒 ${escapeHtml(formatHistoryTimestamp(entry.timestamp))}</span>
    `;

    const viewResBtn = document.createElement('button');
    viewResBtn.className = 'btn-small';
    viewResBtn.textContent = '👁 Ver Resposta';
    viewResBtn.title = 'Carregar a resposta desta execução no visualizador';
    viewResBtn.addEventListener('click', () => {
      if (entry.response) {
        ownerTab.response = structuredClone(entry.response);
        ownerTab.testResults = entry.testResults ? structuredClone(entry.testResults) : null;
        ownerTab.lastSentInspector = entry.requestSent ? structuredClone(entry.requestSent) : null;
        document.querySelectorAll('[data-res-tab]').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.res-tab-pane').forEach((p) => p.classList.remove('active'));
        document.querySelector('[data-res-tab="body"]')?.classList.add('active');
        document.getElementById('res-tab-body')?.classList.add('active');
        renderResponse(ownerTab);
        document.getElementById('statusMessage').textContent = `Visualizando resposta histórica de ${formatHistoryTimestamp(entry.timestamp)}.`;
      }
    });

    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'btn-small';
    restoreBtn.textContent = '↺ Restaurar Req + Resp';
    restoreBtn.title = 'Restaurar URL, Params, Headers, Body e Resposta desta execução';
    restoreBtn.addEventListener('click', async () => {
      ownerTab.method = entry.method || ownerTab.method;
      ownerTab.url = entry.url || ownerTab.url;
      if (entry.params) ownerTab.params = structuredClone(entry.params);
      if (entry.headers) ownerTab.headers = structuredClone(entry.headers);
      if (entry.auth) ownerTab.auth = structuredClone(entry.auth);
      if (entry.body) ownerTab.body = structuredClone(entry.body);
      if (entry.response) ownerTab.response = structuredClone(entry.response);
      if (entry.testResults) ownerTab.testResults = structuredClone(entry.testResults);
      await syncTabBackToCollectionItem(ownerTab);
      await saveSessionState();
      renderAll();
      document.getElementById('statusMessage').textContent = `Estado da requisição restaurado da execução de ${formatHistoryTimestamp(entry.timestamp)}!`;
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-icon';
    delBtn.textContent = '✕';
    delBtn.title = 'Remover esta execução do histórico desta requisição';
    delBtn.addEventListener('click', async () => {
      ownerTab.history.splice(idx, 1);
      await syncTabBackToCollectionItem(ownerTab);
      await saveSessionState();
      renderAll();
    });

    const diffBtn = document.createElement('button');
    diffBtn.className = 'btn-small';
    diffBtn.textContent = '🔀 Diff c/ Atual';
    diffBtn.title = 'Comparar o JSON/Body desta execução histórica com a resposta atual da requisição';
    diffBtn.addEventListener('click', () => {
      openHistoryDiffModal(ownerTab, entry);
    });

    row.appendChild(infoSpan);
    row.appendChild(diffBtn);
    row.appendChild(viewResBtn);
    row.appendChild(restoreBtn);
    row.appendChild(delBtn);
    listEl.appendChild(row);
  });
}


function formatBodyForDiff(rawBody) {
  if (!rawBody) return '';
  try {
    return JSON.stringify(JSON.parse(rawBody), null, 2);
  } catch {
    return String(rawBody);
  }
}


function openHistoryDiffModal(tab, histEntry) {
  const modal = document.getElementById('historyDiffModal');
  const metaBar = document.getElementById('historyDiffMetaBar');
  const diffPre = document.getElementById('historyDiffOutputPre');
  if (!modal || !metaBar || !diffPre || !tab || !histEntry) return;

  const curRes = tab.response || {};
  const oldRes = histEntry.response || {};

  metaBar.innerHTML = `
    <span><strong>Histórico (${escapeHtml(formatHistoryTimestamp(histEntry.timestamp))}):</strong> Status ${escapeHtml(oldRes.status ?? histEntry.status ?? 0)} (${escapeHtml(oldRes.timeMs ?? histEntry.timeMs ?? 0)} ms)</span>
    <span>⇄</span>
    <span><strong>Resposta Atual:</strong> Status ${escapeHtml(curRes.status ?? 0)} (${escapeHtml(curRes.timeMs ?? 0)} ms)</span>
  `;

  const oldLines = formatBodyForDiff(oldRes.body).split('\n');
  const newLines = formatBodyForDiff(curRes.body).split('\n');

  diffPre.innerHTML = '';
  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    const oLine = oldLines[i];
    const nLine = newLines[i];
    if (oLine === nLine) {
      const div = document.createElement('div');
      div.style.color = 'var(--text-secondary)';
      div.textContent = `  ${nLine ?? ''}`;
      diffPre.appendChild(div);
    } else {
      if (oLine !== undefined) {
        const delDiv = document.createElement('div');
        delDiv.style.backgroundColor = 'rgba(239, 68, 68, 0.14)';
        delDiv.style.color = 'var(--diff-del-text, #f87171)';
        delDiv.textContent = `- ${oLine}`;
        diffPre.appendChild(delDiv);
      }
      if (nLine !== undefined) {
        const addDiv = document.createElement('div');
        addDiv.style.backgroundColor = 'rgba(16, 185, 129, 0.14)';
        addDiv.style.color = 'var(--diff-add-text, #34d399)';
        addDiv.textContent = `+ ${nLine}`;
        diffPre.appendChild(addDiv);
      }
    }
  }

  modal.classList.remove('hidden');
}


function renderResponseCore(tab) {
  const metaContainer = document.getElementById('responseMeta');
  const bodyPre = document.getElementById('responseBodyPre');
  const headersGrid = document.getElementById('responseHeadersList');
  const cookiesGrid = document.getElementById('responseCookiesList');
  const badgeResHeaders = document.getElementById('badgeResHeaders');
  const badgeResCookies = document.getElementById('badgeResCookies');
  const badgeResTests = document.getElementById('badgeResTests');
  const testsList = document.getElementById('responseTestsList');

  if (!tab) return;

  renderRequestHistoryPane(tab);

  if (tab.loading) {
    metaContainer.innerHTML = `<span class="meta-pill meta-warn"><span class="loading-spinner" aria-hidden="true"></span>Executando requisição...</span>`;
    bodyPre.textContent = 'Aguardando resposta do servidor...';
    headersGrid.innerHTML = '';
    cookiesGrid.innerHTML = '';
    badgeResHeaders.textContent = '';
    badgeResCookies.textContent = '';
    badgeResTests.textContent = '';
    return;
  }

  const res = tab.response;
  if (!res) {
    metaContainer.innerHTML = `<span class="meta-placeholder">Envie uma requisição para inspecionar a resposta</span>`;
    bodyPre.textContent = 'Aguardando envio da requisição...';
    headersGrid.innerHTML = '';
    cookiesGrid.innerHTML = '';
    badgeResHeaders.textContent = '';
    badgeResCookies.textContent = '';
    badgeResTests.textContent = '';
    testsList.innerHTML = `<div class="empty-hint">Nenhuma assertion ou captura executada ainda.</div>`;
    return;
  }

  if (!res.ok && res.status === 0) {
    metaContainer.innerHTML = `<span class="meta-pill meta-err">Erro: ${escapeHtml(res.statusText || 'Falha de Rede')}</span><span>${escapeHtml(res.timeMs || 0)} ms</span>`;
    bodyPre.textContent = (res.error && (res.error.message || res.error)) || 'Erro desconhecido ao executar a requisição.';
    headersGrid.innerHTML = '';
    cookiesGrid.innerHTML = '';
    badgeResHeaders.textContent = '';
    badgeResCookies.textContent = '';
    badgeResTests.textContent = '';
    return;
  }

  const statusClass = res.status >= 200 && res.status < 300 ? 'meta-ok' : res.status >= 400 ? 'meta-err' : 'meta-warn';
  const hops = Array.isArray(res.redirectHops) ? res.redirectHops : [];
  const hopsHtml = hops.length > 0
    ? ` <button type="button" id="btnInspectRedirectHops" class="meta-pill meta-warn" style="cursor:pointer;border:none;" title="Clique para inspecionar os saltos de redirect">↪ ${hops.length} redirect(s)</button>`
    : '';
  metaContainer.innerHTML = `
    <span>Status: <strong class="meta-pill ${statusClass}">${escapeHtml(res.status)} ${escapeHtml(res.statusText || '')}</strong></span>
    <span>Time: <strong class="meta-pill ${statusClass}">${escapeHtml(res.timeMs)} ms</strong></span>
    <span>Size: <strong class="meta-pill ${statusClass}">${escapeHtml(formatBytes(res.sizeBytes))}</strong></span>${hopsHtml}
  `;
  if (hops.length > 0) {
    document.getElementById('btnInspectRedirectHops')?.addEventListener('click', () => {
      const details = hops
        .map((h, i) => `${i + 1}. [${h.status}] ${h.url} -> ${h.location} (${h.timeMs}ms)`)
        .join('\n');
      window.CDO?.dialog?.confirm?.({
        title: `Cadeia de Redirects (${hops.length} hop(s))`,
        message: 'Saltos HTTP seguidos antes da resposta final:',
        details,
        confirmLabel: 'Fechar'
      });
    });
  }

  // Body Pretty vs Raw + Filtro JSONPath / Busca Rápida
  const filterExpr = (state.responseJsonFilter || '').trim();
  const resJsonWarn = document.getElementById('resJsonWarn');
  const ctKey = Object.keys(res.headers || {}).find((k) => k.toLowerCase() === 'content-type');
  const contentType = String((ctKey && res.headers[ctKey]) || '');
  const looksLikeJson = contentType.includes('json') || /^[\s]*[[{]/.test(String(res.body || ''));
  if (state.responseViewMode === 'pretty') {
    // U-12: corpos grandes não passam por stringify+highlight integral (budget <1s p/ 5MB)
    const MAX_PRETTY = 2 * 1024 * 1024;
    let prettyText = null;
    if ((res.body || '').length > MAX_PRETTY) {
      prettyText = `(Resposta grande demais para Pretty: ${formatBytes(res.sizeBytes || res.body.length)}. Use Raw ou Baixar.)\n\n` + String(res.body).slice(0, MAX_PRETTY);
    } else {
      try {
        const parsed = JSON.parse(res.body);
        prettyText = filterExpr
          ? (() => {
              const sub = getByPath(parsed, filterExpr);
              return sub !== undefined ? JSON.stringify(sub, null, 2) : `(Caminho "${filterExpr}" não encontrado no JSON)`;
            })()
          : JSON.stringify(parsed, null, 2);
      } catch {
        prettyText = null;
      }
    }
    if (prettyText !== null) {
      bodyPre.innerHTML = window.CDO?.jsonHighlight?.highlightJson(prettyText) || escapeHtml(prettyText);
      if (resJsonWarn) resJsonWarn.classList.add('hidden');
    } else {
      bodyPre.textContent = res.body || '(Corpo vazio)';
      if (resJsonWarn) resJsonWarn.classList.toggle('hidden', !looksLikeJson);
    }
  } else {
    bodyPre.textContent = res.body || '(Corpo vazio)';
    if (resJsonWarn) resJsonWarn.classList.add('hidden');
  }

  // Response Headers
  const headerEntries = Object.entries(res.headers || {});
  badgeResHeaders.textContent = headerEntries.length > 0 ? `(${headerEntries.length})` : '';
  headersGrid.innerHTML = '';
  headerEntries.forEach(([k, v]) => {
    const row = document.createElement('div');
    row.className = 'res-header-row';
    const keyEl = document.createElement('div');
    keyEl.className = 'res-header-key';
    keyEl.textContent = k;
    const valEl = document.createElement('div');
    valEl.textContent = Array.isArray(v) ? v.join(', ') : String(v);
    row.appendChild(keyEl);
    row.appendChild(valEl);
    headersGrid.appendChild(row);
  });

  // Response Cookies
  const resCookies = Array.isArray(res.cookies) ? res.cookies : [];
  badgeResCookies.textContent = resCookies.length > 0 ? `(${resCookies.length})` : '';
  cookiesGrid.innerHTML = '';
  if (resCookies.length === 0) {
    cookiesGrid.innerHTML = `<div class="empty-hint">Nenhum cabeçalho Set-Cookie retornado nesta resposta.</div>`;
  } else {
    resCookies.forEach((c) => {
      const row = document.createElement('div');
      row.className = 'res-header-row';
      row.innerHTML = `<div class="res-header-key">${escapeHtml(c.name)} (${escapeHtml(c.domain)})</div><div>${escapeHtml(c.value)}</div>`;
      cookiesGrid.appendChild(row);
    });
  }

  // Test Results & Variable Captures
  testsList.innerHTML = '';
  const tr = tab.testResults;
  if (!tr || (tr.assertions.length === 0 && tr.captures.length === 0)) {
    badgeResTests.textContent = '';
    badgeResTests.classList.remove('fail');
    testsList.innerHTML = `<div class="empty-hint">Nenhuma assertion ou captura configurada nesta requisição.</div>`;
  } else {
    const total = tr.assertions.length;
    const passed = tr.assertions.filter((a) => a.passed).length;
    badgeResTests.textContent = total > 0 ? `(${passed}/${total})` : `(${tr.captures.length})`;
    badgeResTests.classList.toggle('fail', passed < total);

    tr.assertions.forEach((a) => {
      const item = document.createElement('div');
      item.className = 'test-result-item';
      item.innerHTML = `
        <span class="${a.passed ? 'test-badge-pass' : 'test-badge-fail'}">${a.passed ? 'PASS' : 'FAIL'}</span>
        <span><strong>${escapeHtml(a.source)}</strong> ${escapeHtml(a.operator)} <code>${escapeHtml(a.target)}</code> (obtido: <code>${escapeHtml(a.actual)}</code>)</span>
      `;
      testsList.appendChild(item);
    });

    tr.captures.forEach((c) => {
      const item = document.createElement('div');
      item.className = 'test-result-item';
      item.innerHTML = `
        <span class="test-badge-capture">VAR</span>
        <span><code>${escapeHtml(c.source)}</code> → <strong>{{${escapeHtml(c.varName)}}}</strong> = <code>${escapeHtml(c.value)}</code></span>
      `;
      testsList.appendChild(item);
    });
  }

  // Inspector (Request Sent + Console de Scripts)
  const inspectorPre = document.getElementById('responseInspectorPre');
  const consoleListEl = document.getElementById('scriptConsoleLogsList');
  const badgeResInspector = document.getElementById('badgeResInspector');
  const logs = Array.isArray(tab.scriptConsoleLogs) ? tab.scriptConsoleLogs : [];

  if (badgeResInspector) {
    badgeResInspector.textContent = logs.length > 0 ? `(${logs.length})` : '';
  }

  if (consoleListEl) {
    consoleListEl.innerHTML = '';
    if (logs.length === 0) {
      consoleListEl.innerHTML = `<div class="empty-hint">Nenhuma saída de <code>console.log()</code> registrada nos scripts desta requisição.</div>`;
    } else {
      logs.forEach((l) => {
        const item = document.createElement('div');
        item.className = 'test-result-item';
        const badgeCls = l.level === 'ERROR' ? 'test-badge-fail' : l.level === 'WARN' ? 'test-badge-capture' : 'test-badge-pass';
        item.innerHTML = `
          <span class="${badgeCls}">${escapeHtml(l.level)}</span>
          <span class="badge">${escapeHtml(l.phase)} • ${escapeHtml(l.timestamp)}</span>
          <code style="flex:1; word-break:break-all;">${escapeHtml(l.message)}</code>
        `;
        consoleListEl.appendChild(item);
      });
    }
  }

  if (inspectorPre) {
    const sent = res.requestSent || tab.lastSentInspector;
    if (sent) {
      inspectorPre.textContent = JSON.stringify(sent, null, 2);
    } else {
      inspectorPre.textContent = 'Metadados de envio disponíveis após execução da requisição.';
    }
  }
}


function renderResponse(tab) {
  renderResponseCore(tab);
  emitAppHook('response:rendered', {
    tab,
    container: document.getElementById('res-tab-body')
  });
}

(function (root) {
  const api = {
    formatBytes,
    formatHistoryTimestamp,
    renderRequestHistoryPane,
    formatBodyForDiff,
    openHistoryDiffModal,
    renderResponseCore,
    renderResponse
  };
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.core = root.CDO.core || {};
    root.CDO.core.response = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

