(function () {
  'use strict';

  function app() { return window.CDO?.app || null; }

  function statusEl() { return document.getElementById('statusMessage'); }

  function initSseUI() {
    const actions = document.getElementById('toolsMenuSlot') || document.querySelector('.request-header-actions');
    if (!actions || document.getElementById('btnOpenSseModal')) return;
    const btn = document.createElement('button');
    btn.id = 'btnOpenSseModal'; btn.type = 'button'; btn.className = 'btn-secondary'; btn.textContent = '📡 SSE'; btn.title = 'Inspetor Server-Sent Events (text/event-stream)';
    actions.appendChild(btn);

    document.body.insertAdjacentHTML('beforeend', `
      <div id="sseModal" class="modal-backdrop hidden"><div class="modal modal-large">
        <div class="modal-header"><h3>📡 Server-Sent Events Inspector</h3><button id="btnCloseSseModal" class="btn-icon">✕</button></div>
        <div class="modal-body">
          <div class="pane-header" style="flex-wrap:wrap;gap:8px;">
            <input id="sseUrlInput" class="text-input" style="flex:1;min-width:260px;" placeholder="https://.../events" />
            <button id="btnSseStart" class="btn-send" style="height:32px;">▶ Start Stream</button>
            <button id="btnSseStop" class="btn-small btn-danger-ghost">■ Stop</button>
          </div>
          <div id="sseEventsList" class="res-header-row" style="flex-direction:column;align-items:stretch;margin-top:8px;max-height:360px;overflow:auto;"></div>
        </div>
      </div></div>`);

    const modal = document.getElementById('sseModal');
    const list = document.getElementById('sseEventsList');
    let controller = null;

    function addEvent(text) {
      const row = document.createElement('div');
      row.className = 'res-header-row';
      row.innerHTML = `<code style="white-space:pre-wrap;word-break:break-word;">${window.CDO.escape.escapeHtml(String(text))}</code>`;
      list.appendChild(row);
      list.scrollTop = list.scrollHeight;
    }

    btn.addEventListener('click', () => {
      const t = app()?.getActiveTab?.();
      document.getElementById('sseUrlInput').value = t?.url || '';
      modal.classList.remove('hidden');
    });
    document.getElementById('btnCloseSseModal').onclick = () => { try { controller?.abort(); } catch {} controller = null; modal.classList.add('hidden'); };
    modal.addEventListener('click', (e) => { if (e.target === modal) document.getElementById('btnCloseSseModal').click(); });

    document.getElementById('btnSseStop').onclick = () => { try { controller?.abort(); } catch {} controller = null; addEvent('[stream stopped]'); };

    document.getElementById('btnSseStart').onclick = async () => {
      const a = app(); const t = a?.getActiveTab?.();
      const url = app()?.interpolateVariables?.(document.getElementById('sseUrlInput').value.trim()) || document.getElementById('sseUrlInput').value.trim();
      if (!url) return;
      try { controller?.abort(); } catch {}
      controller = new AbortController();
      list.innerHTML = '';
      addEvent(`[connecting] ${url}`);
      const headers = { Accept: 'text/event-stream' };
      for (const h of t?.headers || []) {
        if (h?.enabled !== false && h?.key) headers[h.key] = a.interpolateVariables(h.value || '');
      }
      const auth = a.resolveEffectiveTabAuth?.(t) || {};
      if ((auth.type === 'bearer' || auth.type === 'oauth2') && auth.token) headers.Authorization = `Bearer ${a.interpolateVariables(auth.token)}`;
      if (auth.type === 'basic' && (auth.username || auth.password)) headers.Authorization = `Basic ${btoa(`${a.interpolateVariables(auth.username || '')}:${a.interpolateVariables(auth.password || '')}`)}`;
      try {
        const res = await fetch(url, { method: 'GET', headers, signal: controller.signal });
        addEvent(`[status] ${res.status} ${res.statusText}`);
        if (!res.body) throw new Error('Resposta sem stream');
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split(/\r?\n\r?\n/);
          buf = parts.pop() || '';
          for (const part of parts) {
            const data = part.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
            addEvent(data || part);
          }
        }
        addEvent('[closed]');
      } catch (err) {
        if (err?.name !== 'AbortError') addEvent(`[error] ${err?.message || err}`);
      }
    };
  }

  if (window.CDO?.hookBus) window.CDO.hookBus.on('app:ready', initSseUI); else window.addEventListener('DOMContentLoaded', initSseUI);
})();
