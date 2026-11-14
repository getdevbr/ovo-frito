(function () {
  'use strict';

  function base64ToUint8Array(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function initResponseViewers() {
    const tabBody = document.getElementById('res-tab-body');
    const pre = document.getElementById('responseBodyPre');
    if (!tabBody || !pre || document.getElementById('responseMediaWrap')) return;

    const mediaWrap = document.createElement('div');
    mediaWrap.id = 'responseMediaWrap';
    mediaWrap.className = 'hidden';
    mediaWrap.style.cssText = 'flex:1; overflow:auto; border:1px solid var(--border-color); border-radius:6px; padding:10px; background:var(--bg-secondary); display:flex; flex-direction:column; gap:8px;';
    tabBody.appendChild(mediaWrap);

    let activeObjectUrl = null;
    function revokeActiveUrl() {
      if (activeObjectUrl) {
        URL.revokeObjectURL(activeObjectUrl);
        activeObjectUrl = null;
      }
    }

    function renderMedia() {
      revokeActiveUrl();
      const tab = window.CDO?.app?.getActiveTab?.();
      const res = tab?.response;
      if (!res) {
        mediaWrap.classList.add('hidden');
        return;
      }

      const ct = String(res.contentType || res.headers?.['content-type'] || '').split(';')[0].trim().toLowerCase();
      const isB64 = res.bodyEncoding === 'base64';

      if (!isB64 && ct !== 'text/html') {
        mediaWrap.classList.add('hidden');
        pre.classList.remove('hidden');
        return;
      }

      mediaWrap.innerHTML = '';

      if (ct.startsWith('image/') && isB64) {
        const bytes = base64ToUint8Array(res.body || '');
        const blob = new Blob([bytes], { type: ct });
        activeObjectUrl = URL.createObjectURL(blob);
        const img = document.createElement('img');
        img.src = activeObjectUrl;
        img.alt = 'Resposta de imagem';
        img.style.cssText = 'max-width:100%; max-height:420px; object-fit:contain; align-self:flex-start;';
        mediaWrap.appendChild(img);
        pre.classList.add('hidden');
        mediaWrap.classList.remove('hidden');
        return;
      }

      if (ct === 'application/pdf' && isB64) {
        const bytes = base64ToUint8Array(res.body || '');
        const blob = new Blob([bytes], { type: 'application/pdf' });
        activeObjectUrl = URL.createObjectURL(blob);
        const iframe = document.createElement('iframe');
        iframe.src = activeObjectUrl;
        iframe.style.cssText = 'width:100%; height:440px; border:none; background:#fff;';
        mediaWrap.appendChild(iframe);
        pre.classList.add('hidden');
        mediaWrap.classList.remove('hidden');
        return;
      }

      if (ct === 'text/html') {
        const bar = document.createElement('div');
        bar.style.cssText = 'display:flex; gap:8px; align-items:center;';
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = 'HTML Preview (sandboxed, scripts bloqueados)';
        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'btn-small';
        toggleBtn.textContent = 'Ver Raw';
        let showingRaw = false;
        const iframe = document.createElement('iframe');
        iframe.setAttribute('sandbox', '');
        iframe.srcdoc = res.body || '';
        iframe.style.cssText = 'width:100%; height:400px; border:1px solid var(--border-color); background:#fff;';
        toggleBtn.addEventListener('click', () => {
          showingRaw = !showingRaw;
          if (showingRaw) {
            iframe.classList.add('hidden');
            pre.classList.remove('hidden');
            toggleBtn.textContent = 'Ver Preview HTML';
          } else {
            pre.classList.add('hidden');
            iframe.classList.remove('hidden');
            toggleBtn.textContent = 'Ver Raw';
          }
        });
        bar.append(badge, toggleBtn);
        mediaWrap.append(bar, iframe);
        pre.classList.add('hidden');
        mediaWrap.classList.remove('hidden');
        return;
      }

      if (isB64) {
        const bytes = base64ToUint8Array(res.body || '');
        const slice = bytes.subarray(0, 256);
        const hex = Array.from(slice, (b) => b.toString(16).padStart(2, '0')).join(' ');
        const info = document.createElement('div');
        info.className = 'badge';
        info.textContent = `Binário (${ct || 'application/octet-stream'}) • ${res.sizeBytes || bytes.length} bytes`;
        const hexPre = document.createElement('pre');
        hexPre.className = 'response-pre';
        hexPre.textContent = `Primeiros ${slice.length} bytes (hex):\n${hex}`;
        mediaWrap.append(info, hexPre);
        pre.classList.add('hidden');
        mediaWrap.classList.remove('hidden');
      }
    }

    if (window.CDO?.hookBus) {
      window.CDO.hookBus.on('response:rendered', renderMedia);
      window.CDO.hookBus.on('tab:activated', renderMedia);
    }
  }

  if (window.CDO?.hookBus) {
    window.CDO.hookBus.on('app:ready', initResponseViewers);
  } else {
    window.addEventListener('DOMContentLoaded', initResponseViewers);
  }
})();
