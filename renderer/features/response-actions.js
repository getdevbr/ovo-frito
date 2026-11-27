(function () {
  'use strict';

  function app() { return window.CDO?.app || null; }

  let menuEl = null;

  function ensureMenu() {
    if (menuEl) return menuEl;
    menuEl = document.createElement('div');
    menuEl.id = 'responseJsonContextMenu';
    menuEl.className = 'hidden';
    menuEl.style.cssText = 'position:fixed;z-index:10000;background:var(--bg-secondary,#1e1e2e);border:1px solid var(--border-color,#333);border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,.5);padding:4px;min-width:220px;font-size:12px;';
    document.body.appendChild(menuEl);
    document.addEventListener('mousedown', (e) => {
      if (menuEl && !menuEl.contains(e.target)) menuEl.classList.add('hidden');
    });
    return menuEl;
  }

  function flattenLeafPaths(obj, prefix = '', out = []) {
    if (obj === null || typeof obj !== 'object') {
      if (prefix) out.push({ path: prefix, value: obj });
      return out;
    }
    if (Array.isArray(obj)) {
      obj.slice(0, 10).forEach((v, i) => flattenLeafPaths(v, `${prefix}[${i}]`, out));
      return out;
    }
    for (const [k, v] of Object.entries(obj)) {
      const p = prefix ? `${prefix}.${k}` : k;
      if (v !== null && typeof v === 'object') {
        flattenLeafPaths(v, p, out);
      } else {
        out.push({ path: p, value: v });
      }
      if (out.length >= 60) break;
    }
    return out;
  }

  function addCaptureForPath(jsonPath) {
    const a = app();
    const tab = a?.getActiveTab?.();
    if (!tab) return;
    if (!Array.isArray(tab.captures)) tab.captures = [];
    const defaultVar = jsonPath.split('.').pop().replace(/\[\d+\]/g, '') || 'captured_var';
    tab.captures.push({ source: `json.${jsonPath}`, varName: defaultVar, enabled: true });
    a.renderAll();
    window.CDO?.toast?.show?.({ message: `Capture criada: json.${jsonPath} → {{${defaultVar}}}`, type: 'success' });
  }

  function addAssertionForPath(jsonPath, value) {
    const a = app();
    const tab = a?.getActiveTab?.();
    if (!tab) return;
    if (!Array.isArray(tab.assertions)) tab.assertions = [];
    tab.assertions.push({
      source: `json.${jsonPath}`,
      operator: '==',
      target: value === null ? 'null' : String(value),
      enabled: true
    });
    a.renderAll();
    window.CDO?.toast?.show?.({ message: `Assertion criada: json.${jsonPath} == ${value}`, type: 'success' });
  }

  function copyChainRef(jsonPath) {
    const tab = app()?.getActiveTab?.();
    const reqName = (tab?.name || 'last').trim() || 'last';
    const ref = `{{@${reqName}.json.${jsonPath}}}`;
    navigator.clipboard?.writeText?.(ref);
    window.CDO?.toast?.show?.({ message: `Copiado: ${ref}`, type: 'info' });
  }

  function openMenuAt(x, y, jsonPath, value) {
    const m = ensureMenu();
    m.innerHTML = '';
    const title = document.createElement('div');
    title.style.cssText = 'padding:4px 8px;font-size:11px;opacity:.7;border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:4px;word-break:break-all;';
    title.textContent = `json.${jsonPath}`;
    m.appendChild(title);

    const actions = [
      { label: '🔗 Salvar em variável (Capture)', run: () => addCaptureForPath(jsonPath) },
      { label: '✅ Criar Assertion (== valor atual)', run: () => addAssertionForPath(jsonPath, value) },
      { label: '📋 Copiar referência {{@Req.json...}}', run: () => copyChainRef(jsonPath) }
    ];
    actions.forEach((act) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.style.cssText = 'display:block;width:100%;text-align:left;padding:6px 8px;background:none;border:none;color:inherit;cursor:pointer;border-radius:4px;';
      btn.textContent = act.label;
      btn.addEventListener('mouseenter', () => { btn.style.background = 'var(--bg-elevated,#2a2a3e)'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = ''; });
      btn.addEventListener('click', () => {
        m.classList.add('hidden');
        act.run();
      });
      m.appendChild(btn);
    });

    m.style.left = `${Math.min(x, window.innerWidth - 240)}px`;
    m.style.top = `${Math.min(y, window.innerHeight - 140)}px`;
    m.classList.remove('hidden');
  }

  function init() {
    const bodyPre = document.getElementById('responseBodyPre');
    if (!bodyPre || bodyPre.dataset.contextCaptureBound) return;
    bodyPre.dataset.contextCaptureBound = '1';
    bodyPre.addEventListener('contextmenu', (e) => {
      const tab = app()?.getActiveTab?.();
      if (!tab?.response?.body) return;
      let parsed;
      try { parsed = JSON.parse(tab.response.body); } catch { return; }
      const leaves = flattenLeafPaths(parsed);
      if (leaves.length === 0) return;
      e.preventDefault();

      // Tenta inferir chave sob o clique ou seleção
      const sel = window.getSelection()?.toString()?.trim().replace(/^"|"$/g, '') || '';
      const clickedKey = e.target?.classList?.contains('json-key') ? e.target.textContent.replace(/^"|"$/g, '').replace(/:$/, '') : '';
      const hint = sel || clickedKey;
      const match = hint
        ? leaves.find((l) => l.path.endsWith(`.${hint}`) || l.path === hint) || leaves[0]
        : leaves[0];
      openMenuAt(e.clientX, e.clientY, match.path, match.value);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
