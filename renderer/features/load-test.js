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

  function interpolate(str) {
    return app()?.interpolateVariables?.(String(str ?? '')) ?? String(str ?? '');
  }

  function buildLoadSpec(tab) {
    const effectiveAuth = app()?.resolveEffectiveTabAuth?.(tab) || { type: 'none' };
    const net = app()?.ensureNetworkSettings?.() || {};
    const body = tab.body || {};
    let bodySpec = { mode: 'none' };

    if (body.mode === 'graphql') {
      bodySpec = {
        mode: 'graphql',
        graphqlQuery: interpolate(body.graphqlQuery || ''),
        graphqlVars: interpolate(body.graphqlVars || '{}')
      };
    } else if (body.mode === 'json' || body.mode === 'raw') {
      bodySpec = { mode: body.mode === 'json' ? 'json' : 'raw', raw: interpolate(body.raw || '') };
    } else if (body.mode === 'urlencoded') {
      bodySpec = {
        mode: 'urlencoded',
        urlencoded: (body.urlencoded || []).map((u) => ({
          key: interpolate(u.key || ''),
          value: interpolate(u.value || ''),
          enabled: u.enabled !== false
        }))
      };
    } else if (body.mode === 'formdata') {
      bodySpec = {
        mode: 'formdata',
        formdata: (body.formdata || []).map((f) => ({
          ...f,
          key: interpolate(f.key || ''),
          value: interpolate(f.value || '')
        }))
      };
    }

    return {
      method: tab.method || 'GET',
      url: interpolate(tab.url || ''),
      headers: (tab.headers || []).map((h) => ({
        key: interpolate(h.key || ''),
        value: interpolate(h.value || ''),
        enabled: h.enabled !== false
      })),
      auth: {
        type: effectiveAuth.type || 'none',
        token: interpolate(effectiveAuth.token || ''),
        username: interpolate(effectiveAuth.username || ''),
        password: interpolate(effectiveAuth.password || ''),
        keyName: interpolate(effectiveAuth.keyName || ''),
        keyValue: interpolate(effectiveAuth.keyValue || ''),
        addTo: effectiveAuth.addTo || 'header'
      },
      body: bodySpec,
      timeoutMs: Number(net.timeoutMs) || 30000,
      network: {
        ignoreCertErrors: Boolean(net.ignoreCertErrors),
        proxy: {
          enabled: Boolean(net.proxy?.enabled),
          protocol: net.proxy?.protocol || 'http',
          host: interpolate(net.proxy?.host || ''),
          port: interpolate(String(net.proxy?.port || '8080')),
          username: interpolate(net.proxy?.username || ''),
          password: interpolate(net.proxy?.password || ''),
          bypass: interpolate(net.proxy?.bypass || 'localhost, 127.0.0.1, ::1')
        },
        mtls: {
          enabled: Boolean(net.mtls?.enabled),
          fileName: net.mtls?.fileName || '',
          certBase64: net.mtls?.certBase64 || '',
          passphrase: interpolate(net.mtls?.passphrase || '')
        }
      }
    };
  }

  function initLoadTestUI() {
    const actions = document.getElementById('reqMoreMenuSlot') || document.querySelector('.request-header-actions');
    if (!actions || document.getElementById('btnOpenLoadTestModal')) return;

    const btn = document.createElement('button');
    btn.id = 'btnOpenLoadTestModal';
    btn.type = 'button';
    btn.className = 'btn-secondary';
    btn.innerHTML = `${window.CDO?.icons?.svg?.('zap') || ''} Carga`;
    btn.title = isElectron() ? 'Teste de carga local contra a requisição ativa' : 'Disponível apenas no app Electron';
    if (!isElectron()) btn.disabled = true;
    actions.appendChild(btn);

    const modalHtml = `
      <div id="loadTestModal" class="modal-backdrop hidden">
        <div class="modal modal-large">
          <div class="modal-header">
            <h3>⚡ Teste de Carga Local — Requisição Ativa</h3>
            <button id="btnCloseLoadTestModal" class="btn-icon">✕</button>
          </div>
          <div class="modal-body">
            <div class="env-profile-config-card">
              <div class="pane-header" style="flex-wrap:wrap; gap:8px;">
                <label>Iterações:</label>
                <input id="loadIterationsInput" type="number" class="text-input" style="width:90px;" value="50" min="1" max="1000000" />
                <label>Ou duração (ms, máx 300000):</label>
                <input id="loadDurationInput" type="number" class="text-input" style="width:110px;" value="0" min="0" max="300000" />
                <label>Concorrência:</label>
                <input id="loadConcurrencyInput" type="number" class="text-input" style="width:80px;" value="5" min="1" max="200" />
                <button id="btnLoadStart" class="btn-send" style="height:32px;">▶ Iniciar</button>
                <button id="btnLoadStop" class="btn-small btn-danger-ghost">■ Parar</button>
              </div>
              <div style="font-size:12px; color:var(--text-secondary); margin-top:6px;">
                Use apenas em ambientes que você controla. Scripts <code>pm.*</code> não rodam no modo carga; assertions declarativas são avaliadas.
              </div>
            </div>
            <div id="loadProgressBox" class="chain-box" style="margin-top:8px;">
              <div class="chain-box-title">Progresso</div>
              <div id="loadProgressText" class="badge">Aguardando execução</div>
              <pre id="loadResultPre" class="response-pre" style="min-height:120px; margin-top:8px;"></pre>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = document.getElementById('loadTestModal');
    let currentRunId = null;
    let unsubProgress = null;
    let unsubDone = null;

    function renderProgress(snap) {
      const text = document.getElementById('loadProgressText');
      const pre = document.getElementById('loadResultPre');
      if (!text || !pre) return;
      text.textContent = `Total ${snap.total || 0} • OK ${snap.succeeded || 0} • Erros ${snap.failed || 0} • RPS ${snap.rps || 0} • p95 ${snap.p95 || 0} ms`;
      pre.textContent = JSON.stringify(
        {
          total: snap.total,
          succeeded: snap.succeeded,
          failed: snap.failed,
          errorRate: snap.errorRate,
          rps: snap.rps,
          minMs: snap.minMs,
          avgMs: snap.avgMs,
          maxMs: snap.maxMs,
          p50: snap.p50,
          p90: snap.p90,
          p95: snap.p95,
          p99: snap.p99,
          statusCounts: snap.statusCounts
        },
        null,
        2
      );
    }

    function ensureSubscriptions() {
      if (!unsubProgress) {
        unsubProgress = subscribe('pm:load:progress', (snap) => {
          if (!currentRunId || snap.runId === currentRunId) renderProgress(snap);
        });
      }
      if (!unsubDone) {
        unsubDone = subscribe('pm:load:done', (snap) => {
          if (!currentRunId || snap.runId === currentRunId) {
            renderProgress(snap);
            const status = document.getElementById('statusMessage');
            if (status) status.textContent = snap.ok === false ? `Carga falhou: ${snap.error || 'erro'}` : `Carga concluída: ${snap.total} requisições, ${snap.failed} erros.`;
          }
        });
      }
    }

    btn.addEventListener('click', () => {
      modal.classList.remove('hidden');
      ensureSubscriptions();
    });
    document.getElementById('btnCloseLoadTestModal')?.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });

    document.getElementById('btnLoadStart')?.addEventListener('click', async () => {
      if (!isElectron()) return;
      const tab = app()?.getActiveTab?.();
      if (!tab) return;
      const spec = buildLoadSpec(tab);
      const assertions = (tab.assertions || [])
        .filter((a) => a && a.enabled !== false && a.source)
        .map((a) => ({ ...a, target: interpolate(a.target ?? '') }));
      const res = await invoke('pm:load:start', {
        spec,
        variables: {},
        concurrency: Number(document.getElementById('loadConcurrencyInput')?.value || 5),
        iterations: Number(document.getElementById('loadIterationsInput')?.value || 50),
        durationMs: Number(document.getElementById('loadDurationInput')?.value || 0),
        assertions
      });
      if (res?.ok && res.runId) {
        currentRunId = res.runId;
        const status = document.getElementById('statusMessage');
        if (status) status.textContent = `Teste de carga iniciado (runId ${res.runId}).`;
      } else {
        const status = document.getElementById('statusMessage');
        if (status) status.textContent = `Falha ao iniciar carga: ${res?.error?.message || res?.error || 'erro'}`;
      }
    });

    document.getElementById('btnLoadStop')?.addEventListener('click', async () => {
      if (!isElectron() || !currentRunId) return;
      await invoke('pm:load:stop', { runId: currentRunId });
      const status = document.getElementById('statusMessage');
      if (status) status.textContent = 'Parada de carga solicitada.';
    });
  }

  if (window.CDO?.hookBus) {
    window.CDO.hookBus.on('app:ready', initLoadTestUI);
  } else {
    window.addEventListener('DOMContentLoaded', initLoadTestUI);
  }
})();
