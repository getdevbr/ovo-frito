(function () {
  'use strict';

  function app() { return window.CDO?.app || null; }
  function statusEl() { return document.getElementById('statusMessage'); }
  function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function initVaultUI() {
    const actions = document.getElementById('toolsMenuSlot') || document.querySelector('.request-header-actions');
    if (!actions || document.getElementById('btnOpenVaultModal')) return;
    const btn = document.createElement('button');
    btn.id = 'btnOpenVaultModal'; btn.type = 'button'; btn.className = 'btn-secondary'; btn.textContent = '🗝 Cofre'; btn.title = 'Cofre local AES-256-GCM para segredos';
    actions.appendChild(btn);

    document.body.insertAdjacentHTML('beforeend', `
      <div id="vaultModal" class="modal-backdrop hidden"><div class="modal modal-large">
        <div class="modal-header"><h3>🗝 Cofre Local AES-256-GCM</h3><button id="btnCloseVaultModal" class="btn-icon">✕</button></div>
        <div class="modal-body">
          <div class="pane-header" style="flex-wrap:wrap;gap:8px;">
            <input id="vaultPasswordInput" type="password" class="text-input" style="max-width:260px;" placeholder="Master password" />
            <button id="btnVaultUnlock" class="btn-send" style="height:32px;">🔓 Unlock</button>
            <button id="btnVaultLock" class="btn-small btn-danger-ghost">🔒 Lock</button>
            <span id="vaultStatus" style="font-size:12px;color:var(--text-secondary);"></span>
          </div>
          <div class="chain-grid" style="margin-top:10px;">
            <input id="vaultKeyInput" class="text-input" placeholder="secret_key" />
            <input id="vaultValueInput" class="text-input" placeholder="valor secreto" />
            <button id="btnVaultSet" class="btn-small">💾 Save</button>
            <button id="btnVaultGet" class="btn-small">📥 Get</button>
            <button id="btnVaultDelete" class="btn-small btn-danger-ghost">🗑 Delete</button>
          </div>
          <pre id="vaultOutputPre" class="response-pre" style="min-height:180px;margin-top:8px;"></pre>
        </div>
      </div></div>`);

    const modal = document.getElementById('vaultModal');
    const out = document.getElementById('vaultOutputPre');
    const status = document.getElementById('vaultStatus');

    async function refreshStatus() {
      const res = await app().ipc.invoke('pm:vault:status');
      status.textContent = res?.unlocked ? `Desbloqueado (${res.count} segredos)` : 'Bloqueado';
    }

    btn.addEventListener('click', () => { modal.classList.remove('hidden'); refreshStatus(); });
    document.getElementById('btnCloseVaultModal').onclick = () => modal.classList.add('hidden');
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

    document.getElementById('btnVaultUnlock').onclick = async () => {
      const password = document.getElementById('vaultPasswordInput').value;
      const res = await app().ipc.invoke('pm:vault:unlock', { password });
      out.textContent = JSON.stringify(res, null, 2);
      await refreshStatus();
      if (statusEl() && res?.ok) statusEl().textContent = 'Cofre desbloqueado.';
    };
    document.getElementById('btnVaultLock').onclick = async () => {
      const res = await app().ipc.invoke('pm:vault:lock');
      out.textContent = JSON.stringify(res, null, 2);
      document.getElementById('vaultPasswordInput').value = '';
      await refreshStatus();
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
