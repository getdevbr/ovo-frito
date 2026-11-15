(function () {
  'use strict';

  function app() { return window.CDO?.app || null; }
  function ipc() { return app()?.ipc; }
  function statusEl() { return document.getElementById('statusMessage'); }
  function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function initGitSyncUI() {
    const actions = document.getElementById('workspaceMenuSlot') || document.querySelector('.request-header-actions');
    if (!actions || document.getElementById('btnOpenGitSyncModal')) return;

    const btn = document.createElement('button');
    btn.id = 'btnOpenGitSyncModal';
    btn.type = 'button';
    btn.className = 'btn-secondary';
    btn.textContent = '🌿 Git';
    btn.title = 'Sincronizar Collection com repositório Git remoto';
    actions.appendChild(btn);

    document.body.insertAdjacentHTML('beforeend', `
      <div id="gitSyncModal" class="modal-backdrop hidden">
        <div class="modal modal-large">
          <div class="modal-header">
            <h3>🌿 Git Sync — Repositório Remoto</h3>
            <button id="btnCloseGitSyncModal" class="btn-icon">✕</button>
          </div>
          <div class="modal-body">
            <div id="gitConnectForm" class="env-profile-config-card">
              <div class="chain-grid">
                <div>
                  <label>Collection:</label>
                  <select id="gitCollectionSelect" class="select-input w-full"></select>
                </div>
                <div>
                  <label>URL do repositório:</label>
                  <input id="gitRepoUrl" type="text" class="text-input" placeholder="https://github.com/org/apis.git" />
                </div>
                <div>
                  <label>Branch:</label>
                  <input id="gitBranch" type="text" class="text-input" placeholder="main" />
                </div>
                <div>
                  <label>Subpasta no repo:</label>
                  <input id="gitSubdir" type="text" class="text-input" placeholder="slug da Collection" />
                </div>
                <div>
                  <label>Credenciais:</label>
                  <select id="gitCredentialMode" class="select-input w-full">
                    <option value="userpass">Usuário + senha/token (HTTPS)</option>
                    <option value="system">Usar credenciais do Git do sistema</option>
                  </select>
                </div>
                <div id="gitUserPassFields" class="chain-grid" style="grid-column:1/-1;">
                  <div>
                    <label>Usuário:</label>
                    <input id="gitUsername" type="text" class="text-input" placeholder="usuario ou oauth2" />
                  </div>
                  <div>
                    <label>Senha ou Personal Access Token:</label>
                    <input id="gitPassword" type="password" class="text-input" placeholder="senha ou PAT (GitHub/GitLab/Bitbucket não aceitam senha da conta)" />
                  </div>
                </div>
                <div>
                  <label>Autor dos commits — nome:</label>
                  <input id="gitAuthorName" type="text" class="text-input" placeholder="git config user.name" />
                </div>
                <div>
                  <label>Autor dos commits — e-mail:</label>
                  <input id="gitAuthorEmail" type="text" class="text-input" placeholder="git config user.email" />
                </div>
                <div>
                  <label>Auto-sync (min, 0=off, mín 5):</label>
                  <input id="gitAutoSync" type="number" class="text-input" min="0" step="5" placeholder="0" />
                </div>
              </div>
              <div class="chain-actions" style="margin-top:8px;">
                <button id="btnGitTestConnection" class="btn-small">🔌 Testar conexão</button>
                <button id="btnGitConnect" class="btn-send" style="height:32px;">🔗 Conectar</button>
              </div>
              <div style="font-size:12px; color:var(--text-secondary); margin-top:6px;">
                Credenciais ficam somente no cofre local (AES-256-GCM). A senha nunca vai para a URL, para <code>.git/config</code> ou para o repositório.
              </div>
            </div>

            <div id="gitRepoPanel" class="env-profile-config-card hidden" style="margin-top:10px;">
              <div class="pane-header" style="flex-wrap:wrap; gap:8px;">
                <strong id="gitRepoTitle"></strong>
                <span id="gitRepoBadge" class="badge"></span>
              </div>
              <div id="gitRepoDetail" style="margin-top:6px; font-size:12px; color:var(--text-secondary); font-family:var(--font-mono);"></div>
              <div class="chain-actions" style="margin-top:8px;">
                <button id="btnGitSyncNow" class="btn-send" style="height:32px;">🔄 Sincronizar</button>
                <button id="btnGitPull" class="btn-small">⬇ Pull</button>
                <button id="btnGitPush" class="btn-small">⬆ Push</button>
                <button id="btnGitStatus" class="btn-small">↻ Status</button>
                <button id="btnGitDisconnect" class="btn-small btn-danger-ghost">✖ Desconectar</button>
              </div>
            </div>

            <div id="gitConflictBox" class="chain-box hidden" style="margin-top:10px; border-color:#ef4444;">
              <div class="chain-box-title">⚠ Conflito de merge</div>
              <div id="gitConflictFiles" style="font-family:var(--font-mono); font-size:12px; margin:6px 0;"></div>
              <div class="chain-actions">
                <button id="btnGitKeepLocal" class="btn-small btn-danger">🛡 Manter local (force push)</button>
                <button id="btnGitKeepRemote" class="btn-small">🌐 Manter remoto</button>
                <button id="btnGitCancelConflict" class="btn-small btn-danger-ghost">Cancelar</button>
              </div>
            </div>

            <pre id="gitSyncLog" class="response-pre" style="min-height:100px; margin-top:8px;"></pre>
          </div>
        </div>
      </div>
    `);

    const modal = document.getElementById('gitSyncModal');
    const log = document.getElementById('gitSyncLog');
    let currentRepo = null;
    let conflictFiles = [];
    let unsubs = [];

    function logLine(msg) {
      log.textContent = `${new Date().toLocaleTimeString('pt-BR')} ${msg}\n${log.textContent}`.slice(0, 20000);
    }

    function selectedCollection() {
      const id = document.getElementById('gitCollectionSelect')?.value;
      return app()?.state?.collections?.find((c) => c.id === id) || null;
    }

    function collectForm() {
      const col = selectedCollection();
      return {
        collectionId: col?.id || '',
        url: document.getElementById('gitRepoUrl')?.value?.trim() || '',
        branch: document.getElementById('gitBranch')?.value?.trim() || 'main',
        subdir: document.getElementById('gitSubdir')?.value?.trim() || '',
        credentialMode: document.getElementById('gitCredentialMode')?.value || 'userpass',
        username: document.getElementById('gitUsername')?.value?.trim() || '',
        password: document.getElementById('gitPassword')?.value || '',
        authorName: document.getElementById('gitAuthorName')?.value?.trim() || '',
        authorEmail: document.getElementById('gitAuthorEmail')?.value?.trim() || '',
        autoSyncMinutes: Number(document.getElementById('gitAutoSync')?.value) || 0
      };
    }

    async function refreshRepos() {
      const res = await ipc()?.invoke('pm:git:list');
      const repos = res?.repos || [];
      const col = selectedCollection();
      currentRepo = repos.find((r) => r.collectionId === col?.id) || repos[0] || null;
      renderPanel();
      return repos;
    }

    function renderPanel() {
      const panel = document.getElementById('gitRepoPanel');
      const form = document.getElementById('gitConnectForm');
      if (!panel || !form) return;
      if (!currentRepo) {
        panel.classList.add('hidden');
        return;
      }
      panel.classList.remove('hidden');
      document.getElementById('gitRepoTitle').textContent = `${currentRepo.url} (${currentRepo.branch})`;
      const badge = document.getElementById('gitRepoBadge');
      badge.textContent = currentRepo.lastSyncStatus === 'conflict' ? '⚠ conflito' : (currentRepo.lastSyncAt ? '✓ sincronizado' : '○ conectado');
      document.getElementById('gitRepoDetail').textContent =
        `subpasta: ${currentRepo.subdir} • credenciais: ${currentRepo.credentialMode === 'system' ? 'sistema' : 'usuário/senha (cofre)'} • auto-sync: ${currentRepo.autoSyncMinutes || 'off'}min` +
        (currentRepo.lastSyncAt ? ` • último sync: ${new Date(currentRepo.lastSyncAt).toLocaleString('pt-BR')}` : '');
    }

    async function refreshStatus() {
      if (!currentRepo) return;
      const res = await ipc()?.invoke('pm:git:status', { repoId: currentRepo.id });
      if (res?.ok) {
        logLine(`status: ${res.cloned ? `${res.dirty.length} alterado(s), ${res.ahead} à frente, ${res.behind} atrás` : 'clone não encontrado'}`);
        if (res.dirty?.length) logLine(res.dirty.slice(0, 10).join('\n'));
      } else {
        logLine(`status falhou: ${res?.error?.message || res?.error || 'erro'}`);
      }
    }

    function showConflict(payload) {
      conflictFiles = payload?.files || [];
      const box = document.getElementById('gitConflictBox');
      if (!box) return;
      box.classList.remove('hidden');
      document.getElementById('gitConflictFiles').textContent = conflictFiles.join('\n');
      logLine(`CONFLITO em: ${conflictFiles.join(', ')}`);
    }

    btn.addEventListener('click', async () => {
      const sel = document.getElementById('gitCollectionSelect');
      sel.innerHTML = '';
      for (const col of app()?.state?.collections || []) {
        const opt = document.createElement('option');
        opt.value = col.id;
        opt.textContent = col.name || col.id;
        sel.appendChild(opt);
      }
      modal.classList.remove('hidden');
      log.textContent = '';
      await refreshRepos();
      if (unsubs.length === 0 && window.pm?.sdk?.IPC?.subscribe) {
        unsubs.push(window.pm.sdk.IPC.subscribe('pm:git:progress', (_e, p) => logLine(`… ${p?.stage || ''} ${p?.message || ''}`)));
        unsubs.push(window.pm.sdk.IPC.subscribe('pm:git:synced', () => { logLine('✓ sincronizado'); refreshRepos(); }));
        unsubs.push(window.pm.sdk.IPC.subscribe('pm:git:conflict', (_e, p) => showConflict(p)));
      }
    });

    document.getElementById('btnCloseGitSyncModal')?.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

    document.getElementById('gitCredentialMode')?.addEventListener('change', (e) => {
      const fields = document.getElementById('gitUserPassFields');
      fields?.classList.toggle('hidden', e.target.value === 'system');
    });

    document.getElementById('gitCollectionSelect')?.addEventListener('change', () => {
      const col = selectedCollection();
      const sub = document.getElementById('gitSubdir');
      if (sub && col && !sub.value) {
        sub.value = String(col.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'collection';
      }
      refreshRepos();
    });

    document.getElementById('btnGitTestConnection')?.addEventListener('click', async () => {
      const f = collectForm();
      logLine('testando conexão…');
      const res = await ipc()?.invoke('pm:git:testConnection', f);
      logLine(res?.ok ? `✓ conexão OK (${res.heads} heads)` : `✗ ${res?.error?.message || res?.message || 'falha'}`);
    });

    document.getElementById('btnGitConnect')?.addEventListener('click', async () => {
      const f = collectForm();
      if (!f.collectionId || !f.url) {
        if (statusEl()) statusEl().textContent = 'Selecione a Collection e informe a URL do repositório.';
        return;
      }
      logLine('conectando…');
      const res = await ipc()?.invoke('pm:git:connect', f);
      if (res?.ok) {
        logLine(`✓ conectado: ${res.repo?.url}`);
        document.getElementById('gitPassword').value = '';
        await refreshRepos();
      } else {
        logLine(`✗ ${res?.error?.message || res?.message || 'falha ao conectar'}`);
        if (res?.error?.code === 'VAULT_LOCKED' && window.CDO?.vault?.requestUnlock) {
          await window.CDO.vault.requestUnlock();
        }
      }
    });

    document.getElementById('btnGitSyncNow')?.addEventListener('click', async () => {
      if (!currentRepo) return;
      const res = await ipc()?.invoke('pm:git:sync', { repoId: currentRepo.id });
      logLine(res?.ok ? '✓ sync concluído' : `✗ ${res?.error?.message || 'falha no sync'}`);
      await refreshRepos();
    });
    document.getElementById('btnGitPull')?.addEventListener('click', async () => {
      if (!currentRepo) return;
      const res = await ipc()?.invoke('pm:git:pull', { repoId: currentRepo.id });
      if (res?.code === 'GIT_CONFLICT') showConflict(res);
      logLine(res?.ok ? '✓ pull ok' : `✗ ${res?.error?.message || res?.message || 'falha no pull'}`);
      await refreshRepos();
    });
    document.getElementById('btnGitPush')?.addEventListener('click', async () => {
      if (!currentRepo) return;
      const res = await ipc()?.invoke('pm:git:push', { repoId: currentRepo.id });
      logLine(res?.ok ? '✓ push ok' : `✗ ${res?.error?.message || res?.message || 'falha no push'}`);
      await refreshRepos();
    });
    document.getElementById('btnGitStatus')?.addEventListener('click', refreshStatus);
    document.getElementById('btnGitDisconnect')?.addEventListener('click', async () => {
      if (!currentRepo) return;
      const del = window.confirm('Desconectar este repositório? O clone local em data/git-repos será mantido (use "deleteLocalClone" via API para remover).');
      if (!del) return;
      const res = await ipc()?.invoke('pm:git:disconnect', { repoId: currentRepo.id });
      logLine(res?.ok ? '✓ desconectado' : `✗ ${res?.error?.message || 'falha'}`);
      currentRepo = null;
      document.getElementById('gitConflictBox')?.classList.add('hidden');
      await refreshRepos();
    });

    document.getElementById('btnGitKeepLocal')?.addEventListener('click', async () => {
      if (!currentRepo) return;
      const ok = window.confirm('Manter versão LOCAL e sobrescrever o remoto com force push? Esta ação é destrutiva no repositório remoto.');
      if (!ok) return;
      const res = await ipc()?.invoke('pm:git:resolveConflict', { repoId: currentRepo.id, strategy: 'local' });
      logLine(res?.ok ? '✓ versão local mantida' : `✗ ${res?.error?.message || 'falha'}`);
      document.getElementById('gitConflictBox')?.classList.add('hidden');
      await refreshRepos();
    });
    document.getElementById('btnGitKeepRemote')?.addEventListener('click', async () => {
      if (!currentRepo) return;
      const ok = window.confirm('Manter versão REMOTA? Alterações locais não enviadas serão descartadas (reset --hard).');
      if (!ok) return;
      const res = await ipc()?.invoke('pm:git:resolveConflict', { repoId: currentRepo.id, strategy: 'remote' });
      logLine(res?.ok ? '✓ versão remota mantida' : `✗ ${res?.error?.message || 'falha'}`);
      document.getElementById('gitConflictBox')?.classList.add('hidden');
      await refreshRepos();
    });
    document.getElementById('btnGitCancelConflict')?.addEventListener('click', () => {
      document.getElementById('gitConflictBox')?.classList.add('hidden');
      conflictFiles = [];
    });
  }

  if (window.CDO?.hookBus) {
    window.CDO.hookBus.on('app:ready', initGitSyncUI);
  } else {
    window.addEventListener('DOMContentLoaded', initGitSyncUI);
  }
})();
