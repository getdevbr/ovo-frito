(function () {
  'use strict';

  function app() { return window.CDO?.app || null; }
  function statusEl() { return document.getElementById('statusMessage'); }

  function initWebSocketUI() {
    const actions = document.getElementById('toolsMenuSlot') || document.querySelector('.request-header-actions');
    if (!actions || document.getElementById('btnOpenWsModal')) return;
    const btn = document.createElement('button');
    btn.id = 'btnOpenWsModal'; btn.type = 'button'; btn.className = 'btn-secondary'; btn.textContent = '🔌 WS'; btn.title = 'Cliente WebSocket ws:// / wss://';
    actions.appendChild(btn);

    document.body.insertAdjacentHTML('beforeend', `
      <div id="wsModal" class="modal-backdrop hidden"><div class="modal modal-large">
        <div class="modal-header"><h3>🔌 WebSocket Client</h3><button id="btnCloseWsModal" class="btn-icon">✕</button></div>
        <div class="modal-body">
          <div class="pane-header" style="flex-wrap:wrap;gap:8px;">
            <input id="wsUrlInput" class="text-input" style="flex:1;min-width:260px;" placeholder="ws://127.0.0.1:8080/socket ou wss://..." />
            <button id="btnWsConnect" class="btn-send" style="height:32px;">Conectar</button>
            <button id="btnWsDisconnect" class="btn-small btn-danger-ghost">Desconectar</button>
            <select id="wsSaveCollectionSelect" class="select-input" style="min-width:150px;"></select>
            <button id="btnWsSaveTemplate" class="btn-small">💾 Salvar Template</button>
          </div>
          <div class="chain-grid" style="margin-top:8px;">
            <input id="wsMessageInput" class="text-input" placeholder="Mensagem para enviar..." />
            <button id="btnWsSend" class="btn-small">Enviar</button>
          </div>
          <pre id="wsLogPre" class="response-pre" style="min-height:220px;margin-top:8px;"></pre>
        </div>
      </div></div>`);

    const modal = document.getElementById('wsModal');
    const log = document.getElementById('wsLogPre');
    let socket = null;
    const lines = [];
    function renderLog(){ log.textContent = lines.slice(-300).join('\n'); log.scrollTop = log.scrollHeight; }
    function addLine(text){ lines.push(`[${new Date().toLocaleTimeString('pt-BR')}] ${text}`); renderLog(); }
    function populate(){ const sel=document.getElementById('wsSaveCollectionSelect'); sel.innerHTML=''; for(const c of app()?.state?.collections||[]){const o=document.createElement('option');o.value=c.id;o.textContent=c.name||c.id;sel.appendChild(o);} }

    btn.addEventListener('click',()=>{ const t=app()?.getActiveTab?.(); const url=t?.url||''; document.getElementById('wsUrlInput').value=url.replace(/^http/,'ws'); populate(); modal.classList.remove('hidden'); });
    document.getElementById('btnCloseWsModal').onclick=()=>{ try{socket?.close();}catch{} socket=null; modal.classList.add('hidden'); };
    document.getElementById('btnWsConnect').onclick=()=>{
      try{socket?.close();}catch{}
      const url=document.getElementById('wsUrlInput').value.trim();
      if(!/^wss?:\/\//i.test(url)){ addLine('URL inválida: use ws:// ou wss://'); return; }
      socket=new WebSocket(url);
      socket.onopen=()=>addLine(`OPEN ${url}`);
      socket.onmessage=(e)=>addLine(`◀ ${typeof e.data==='string'?e.data:'[binary/data]'}`);
      socket.onerror=()=>addLine('ERROR no WebSocket');
      socket.onclose=(e)=>addLine(`CLOSE code=${e.code} reason=${e.reason||''}`);
    };
    document.getElementById('btnWsDisconnect').onclick=()=>{ try{socket?.close();}catch{} socket=null; };
    document.getElementById('btnWsSend').onclick=()=>{
      const msg=document.getElementById('wsMessageInput').value;
      if(!socket || socket.readyState!==WebSocket.OPEN){ addLine('Socket não está OPEN'); return; }
      socket.send(msg); addLine(`▶ ${msg}`); document.getElementById('wsMessageInput').value='';
    };
    document.getElementById('wsMessageInput').addEventListener('keydown',(e)=>{ if(e.key==='Enter') document.getElementById('btnWsSend').click(); });
    document.getElementById('btnWsSaveTemplate').onclick=async()=>{
      const a=app(); const col=a?.state?.collections?.find(c=>c.id===document.getElementById('wsSaveCollectionSelect').value);
      const url=document.getElementById('wsUrlInput').value.trim(); if(!col||!url) return;
      const messages=lines.filter(l=>l.includes('▶')).map(l=>l.replace(/^\[[^\]]+\]\s*/,''));
      col.items=[...(col.items||[]),{id:`ws_${Date.now()}`,name:`WS ${new URL(url.replace(/^ws/,'http')).hostname}`,folder:'WebSocket',method:'WS',url,params:[],headers:[],auth:{type:'none'},body:{mode:'raw',raw:messages.join('\n'),graphqlQuery:'',graphqlVars:'{}',urlencoded:[],formdata:[]},assertions:[],captures:[],preRequestScript:'',postResponseScript:''}];
      await a.persistStore('collections'); if(statusEl()) statusEl().textContent='Template WebSocket salvo na Collection.';
    };
  }

  if (window.CDO?.hookBus) window.CDO.hookBus.on('app:ready', initWebSocketUI); else window.addEventListener('DOMContentLoaded', initWebSocketUI);
})();
