(function () {
  'use strict';

  const catalog = window.CDO?.httpHeadersCatalog;
  if (!catalog) return;

  let popup = null;
  let activeInput = null;

  function ensurePopup() {
    if (popup) return popup;
    popup = document.createElement('div');
    popup.id = 'httpHeaderAutocompletePopup';
    popup.className = 'hidden';
    popup.style.cssText = 'position:fixed;z-index:9999;background:var(--bg-secondary,#1e1e2e);border:1px solid var(--border-color,#333);border-radius:6px;box-shadow:0 6px 20px rgba(0,0,0,.4);max-height:220px;overflow-y:auto;min-width:240px;max-width:380px;font-size:12px;';
    document.body.appendChild(popup);
    document.addEventListener('mousedown', (e) => {
      if (popup && !popup.contains(e.target) && e.target !== activeInput) hide();
    });
    return popup;
  }

  function hide() {
    popup?.classList.add('hidden');
    activeInput = null;
  }

  function showSuggestions(input, items) {
    if (!items || items.length === 0) { hide(); return; }
    const el = ensurePopup();
    el.innerHTML = '';
    const rect = input.getBoundingClientRect();
    el.style.left = `${rect.left}px`;
    el.style.top = `${rect.bottom + 2}px`;

    items.slice(0, 14).forEach((item) => {
      const row = document.createElement('div');
      row.style.cssText = 'padding:6px 10px;cursor:pointer;display:flex;justify-content:space-between;gap:8px;border-bottom:1px solid rgba(255,255,255,.04);';
      const label = typeof item === 'string' ? item : item.name;
      const desc = typeof item === 'string' ? '' : (item.desc || '');
      row.innerHTML = `<strong>${window.CDO.app.escapeHtml(label)}</strong>${desc ? `<span style="opacity:.65;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${window.CDO.app.escapeHtml(desc)}</span>` : ''}`;
      row.addEventListener('mouseenter', () => { row.style.background = 'var(--bg-elevated,#2a2a3e)'; });
      row.addEventListener('mouseleave', () => { row.style.background = ''; });
      row.addEventListener('mousedown', (e) => {
        e.preventDefault();
        input.value = label;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        hide();
        // Se preencheu a chave, foca no campo de valor ao lado
        const rowEl = input.closest('.kv-row');
        if (rowEl && typeof item !== 'string') {
          const inputs = rowEl.querySelectorAll('input[type="text"], input:not([type])');
          if (inputs[1] && inputs[0] === input) inputs[1].focus();
        }
      });
      el.appendChild(row);
    });
    el.classList.remove('hidden');
  }

  function handleInputOrFocus(e) {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;
    const table = target.closest('#headersTable');
    if (!table) return;
    const row = target.closest('.kv-row');
    if (!row) return;
    const textInputs = Array.from(row.querySelectorAll('input')).filter((i) => i.type === 'text' || !i.type);
    const colIdx = textInputs.indexOf(target);
    if (colIdx === -1) return;

    activeInput = target;
    if (colIdx === 0) {
      showSuggestions(target, catalog.suggestKeys(target.value));
    } else if (colIdx === 1) {
      const headerKey = textInputs[0]?.value || '';
      if (target.value.includes('{{')) { hide(); return; }
      showSuggestions(target, catalog.suggestValues(headerKey, target.value));
    }
  }

  function init() {
    const headersTable = document.getElementById('headersTable');
    if (!headersTable || headersTable.dataset.headerAcBound) return;
    headersTable.dataset.headerAcBound = '1';
    headersTable.addEventListener('focusin', handleInputOrFocus);
    headersTable.addEventListener('input', handleInputOrFocus);
    headersTable.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hide();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
