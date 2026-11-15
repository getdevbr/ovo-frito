(function () {
  'use strict';

  function initVarAutocomplete() {
    const pop = document.getElementById('varAutocompletePopover');
    if (!pop) return;

    let activeField = null;

    function insertAtCursor(el, text) {
      const start = typeof el.selectionStart === 'number' ? el.selectionStart : el.value.length;
      const end = typeof el.selectionEnd === 'number' ? el.selectionEnd : el.value.length;
      const before = el.value.slice(0, start);
      const after = el.value.slice(end);
      el.value = before + text + after;
      const newPos = start + text.length;
      if (typeof el.setSelectionRange === 'function') {
        el.setSelectionRange(newPos, newPos);
      }
      el.focus();
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function vaultContext(field) {
      const pos = typeof field.selectionStart === 'number' ? field.selectionStart : field.value.length;
      const before = field.value.slice(0, pos);
      const open = before.lastIndexOf('{{');
      if (open === -1) return null;
      const typed = before.slice(open + 2);
      if (typed.includes('}}')) return null;
      const trimmed = typed.trim();
      return trimmed.startsWith('vault.') ? { open, typed: trimmed } : null;
    }

    async function openForField(field) {
      activeField = field;
      const ctx = vaultContext(field);
      if (ctx) {
        let keys = [];
        try {
          const res = await window.CDO?.app?.ipc?.invoke('pm:vault:list');
          if (res?.ok && Array.isArray(res.keys)) keys = res.keys;
        } catch {}
        const term = ctx.typed.slice('vault.'.length).toLowerCase();
        const vars = keys
          .filter((k) => !term || String(k).toLowerCase().includes(term))
          .map((k) => ({ key: `vault.${k}`, value: '••••••', scope: 'Cofre' }));
        renderList(vars, '', ctx);
      } else {
        const vars = window.CDO?.app?.state ? getAvailableVarsSafe() : [];
        renderList(vars, '');
      }

      const rect = field.getBoundingClientRect();
      pop.style.position = 'fixed';
      pop.style.left = `${Math.min(rect.left, window.innerWidth - 380)}px`;
      pop.style.top = `${Math.min(rect.bottom + 4, window.innerHeight - 290)}px`;
      pop.style.right = 'auto';
      pop.classList.remove('hidden');
    }

    function getAvailableVarsSafe() {
      const app = window.CDO?.app;
      if (!app) return [];
      // U-14: usa a lista completa (Env/Profile, Collection, Dinâmicas) com escopo e dica de valor.
      if (typeof getAllAvailableVariables === 'function') {
        try {
          return getAllAvailableVariables(app.getActiveTab?.()).map((v) => ({
            key: v.key,
            value: v.secret ? '••••••' : String(v.value ?? ''),
            scope: v.scope || 'Variável'
          }));
        } catch {}
      }
      const env = app.getActiveEnvironment?.();
      const list = [];
      for (const v of env?.variables || []) {
        if (v && v.enabled !== false && v.key) {
          list.push({ key: v.key, value: v.secret ? '••••••' : String(v.value ?? ''), scope: 'Env' });
        }
      }
      for (const g of window.CDO?.generatorsBr?.REGISTRY || []) {
        list.push({ key: g.token, value: g.label, scope: 'Dinâmica' });
      }
      return list;
    }

    function renderList(vars, filterTerm, ctx = null) {
      const term = String(filterTerm || '').toLowerCase();
      const filtered = term
        ? vars.filter((v) => v.key.toLowerCase().includes(term) || v.value.toLowerCase().includes(term))
        : vars;

      pop.innerHTML = '';
      if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-hint';
        empty.textContent = ctx ? 'Cofre bloqueado ou sem chaves. Desbloqueie o cofre para usar {{vault.*}}.' : 'Nenhuma variável encontrada.';
        pop.appendChild(empty);
        return;
      }

      filtered.slice(0, 30).forEach((v, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-small';
        btn.style.cssText = 'width:100%; display:flex; justify-content:space-between; align-items:center; text-align:left; margin-bottom:2px;';
        if (idx === 0) btn.dataset.selected = 'true';

        const left = document.createElement('span');
        left.textContent = `{{${v.key}}}`;
        left.style.fontFamily = 'var(--font-mono)';

        const right = document.createElement('span');
        right.textContent = `${v.scope} • ${v.value.slice(0, 28)}`;
        right.style.cssText = 'font-size:11px; color:var(--text-secondary);';

        btn.append(left, right);
        btn.addEventListener('click', () => {
          if (activeField && ctx) {
            const pos = typeof activeField.selectionStart === 'number' ? activeField.selectionStart : activeField.value.length;
            const before = activeField.value.slice(0, ctx.open);
            const after = activeField.value.slice(pos);
            activeField.value = before + `{{${v.key}}}` + after;
            const newPos = before.length + `{{${v.key}}}`.length;
            if (typeof activeField.setSelectionRange === 'function') activeField.setSelectionRange(newPos, newPos);
            activeField.focus();
            activeField.dispatchEvent(new Event('input', { bubbles: true }));
          } else if (activeField) {
            insertAtCursor(activeField, `{{${v.key}}}`);
          }
          pop.classList.add('hidden');
        });
        pop.appendChild(btn);
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && (e.code === 'Space' || e.key === ' ')) {
        const el = document.activeElement;
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && !el.readOnly && el.type !== 'checkbox' && el.type !== 'radio') {
          e.preventDefault();
          openForField(el);
        }
        return;
      }

      if (!pop.classList.contains('hidden') && e.key === 'Escape') {
        pop.classList.add('hidden');
        activeField?.focus();
      }
    });
  }

  if (window.CDO?.hookBus) {
    window.CDO.hookBus.on('app:ready', initVarAutocomplete);
  } else {
    window.addEventListener('DOMContentLoaded', initVarAutocomplete);
  }
})();
