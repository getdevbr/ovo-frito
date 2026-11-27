(function () {
  'use strict';

  function app() { return window.CDO?.app || null; }
  function statusEl() { return document.getElementById('statusMessage'); }
  function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function initVaultUI() {
    const actions = document.getElementById('toolsMenuSlot') || document.querySelector('.request-header-actions');
    if (!actions || document.getElementById('btnOpenVaultModal')) return;
    const btn = document.createElement('button');
    btn.id = 'btnOpenVaultModal'; btn.type = 'button'; btn.className = 'btn-secondary'; btn.innerHTML = `${window.CDO?.icons?.svg?.('lock') || ''} Cofre`; btn.title = 'Cofre local AES-256-GCM para segredos';
    actions.appendChild(btn);

    document.body.insertAdjacentHTML('beforeend', `
      <div id="vaultModal" class="modal-backdrop hidden"><div class="modal modal-large">
        <div class="modal-header"><h3>🗝 Cofre Local AES-256-GCM</h3><button id="btnCloseVaultModal" class="btn-icon">✕</button></div>
        <div class="modal-body">
          <div class="pane-header" style="flex-wrap:wrap;gap:8px;">
            <input id="vaultPasswordInput" type="password" class="text-input" style="max-width:260px;" placeholder="Senha mestra" />
            <button id="btnVaultUnlock" class="btn-send" style="height:32px;">🔓 Desbloquear</button>
            <button id="btnVaultLock" class="btn-small btn-danger-ghost">🔒 Bloquear</button>
            <span id="vaultStatus" style="font-size:12px;color:var(--text-secondary);"></span>
          </div>
          <div class="chain-grid" style="margin-top:10px;">
            <input id="vaultKeyInput" class="text-input" spellcheck="false" placeholder="Chave (ex: api_secret)" />
            <div style="display:flex;gap:4px;align-items:center;">
              <input id="vaultValueInput" type="password" class="text-input" spellcheck="false" placeholder="Valor secreto" />
              <button id="btnVaultToggleVis" type="button" class="btn-icon" title="Mostrar/Ocultar valor">👁</button>
            </div>
          </div>
          <div class="chain-actions" style="margin-top:6px;">
            <button id="btnVaultSet" class="btn-small">💾 Salvar</button>
            <button id="btnVaultGet" class="btn-small">📥 Buscar</button>
            <button id="btnVaultDelete" class="btn-small btn-danger-ghost">🗑 Excluir</button>
          </div>
          <pre id="vaultOutputPre" class="response-pre" style="min-height:180px;margin-top:8px;"></pre>
        </div>
      </div></div>`);

    const modal = document.getElementById('vaultModal');
    const out = document.getElementById('vaultOutputPre');
    const status = document.getElementById('vaultStatus');

    let pendingUnlock = null;
    window.CDO = window.CDO || {};
    window.CDO.vault = {
      requestUnlock() {
        return new Promise((resolve) => {
          if (pendingUnlock) {
            pendingUnlock(false);
          }
          pendingUnlock = resolve;
          modal.classList.remove('hidden');
          document.getElementById('vaultPasswordInput')?.focus();
          refreshStatus();
        });
      }
    };
    function settleUnlock(value) {
      if (pendingUnlock) {
        const fn = pendingUnlock;
        pendingUnlock = null;
        fn(value);
      }
    }

    async function refreshStatus() {
      const res = await app().ipc.invoke('pm:vault:status');
      status.textContent = res?.unlocked ? `Desbloqueado (${res.count} segredos)` : 'Bloqueado';
    }

    btn.addEventListener('click', () => { modal.classList.remove('hidden'); refreshStatus(); });
    document.getElementById('btnCloseVaultModal').onclick = () => { modal.classList.add('hidden'); settleUnlock(false); };
    modal.addEventListener('click', (e) => { if (e.target === modal) { modal.classList.add('hidden'); settleUnlock(false); } });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.classList.contains('hidden')) { modal.classList.add('hidden'); settleUnlock(false); }
    });
    document.getElementById('btnVaultToggleVis')?.addEventListener('click', () => {
      const inp = document.getElementById('vaultValueInput');
      if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
    });

    document.getElementById('btnVaultUnlock').onclick = async () => {
      const password = document.getElementById('vaultPasswordInput').value;
      const res = await app().ipc.invoke('pm:vault:unlock', { password });
      out.textContent = JSON.stringify(res, null, 2);
      await refreshStatus();
      if (statusEl() && res?.ok) statusEl().textContent = 'Cofre desbloqueado.';
      settleUnlock(Boolean(res?.ok));
    };
    document.getElementById('btnVaultLock').onclick = async () => {
      const res = await app().ipc.invoke('pm:vault:lock');
      out.textContent = JSON.stringify(res, null, 2);
      document.getElementById('vaultPasswordInput').value = '';
      await refreshStatus();
      settleUnlock(false);
    };
    document.getElementById('btnVaultSet').onclick = async () => {
      const key = document.getElementById('vaultKeyInput').value.trim();
      const value = document.getElementById('vaultValueInput').value;
      const res = await app().ipc.invoke('pm:vault:set', { key, value });
      out.textContent = JSON.stringify(res, null, 2);
      await refreshStatus();
    };
    document.getElementById('btnVaultGet').onclick = async () => {
      const key = document.getElementById('vaultKeyInput').value.trim();
      const res = await app().ipc.invoke('pm:vault:get', { key });
      out.textContent = JSON.stringify(res, null, 2);
    };
    document.getElementById('btnVaultDelete').onclick = async () => {
      const key = document.getElementById('vaultKeyInput').value.trim();
      const res = await app().ipc.invoke('pm:vault:delete', { key });
      out.textContent = JSON.stringify(res, null, 2);
      await refreshStatus();
    };
    void esc;
  }

  if (window.CDO?.hookBus) window.CDO.hookBus.on('app:ready', initVaultUI); else window.addEventListener('DOMContentLoaded', initVaultUI);
})();
