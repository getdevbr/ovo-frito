(function () {
  'use strict';

  let overlay = null;
  let lastFocused = null;

  const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

  function ensureStyles() {
    if (document.getElementById('uiDialogStyles')) return;
    const style = document.createElement('style');
    style.id = 'uiDialogStyles';
    style.textContent = `
      .ui-dialog-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(2px);z-index:var(--z-dialog,1000);display:flex;align-items:center;justify-content:center}
      .ui-dialog{background:var(--popover,#121216);color:var(--popover-foreground,#fafafa);border:1px solid var(--border,#27272a);border-radius:10px;padding:20px;max-width:460px;width:90%;box-shadow:0 16px 40px rgba(0,0,0,.45)}
      .ui-dialog h2{margin:0 0 8px;font-size:16px}
      .ui-dialog p{margin:0 0 8px;font-size:13px;white-space:pre-wrap}
      .ui-dialog .ui-dialog-details{font-size:11px;color:var(--text-secondary,#a1a1aa);margin:0 0 12px;white-space:pre-wrap;max-height:160px;overflow:auto}
      .ui-dialog .ui-dialog-input{width:100%;margin-top:8px;padding:7px 10px;border-radius:6px;border:1px solid var(--border,#27272a);background:var(--bg-secondary,#0c0c0f);color:var(--text-primary,#fafafa);font-size:13px;outline:none}
      .ui-dialog .ui-dialog-input:focus{border-color:var(--blue-btn,#2563eb)}
      .ui-dialog .ui-dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
      .ui-dialog button{padding:6px 14px;border-radius:6px;border:1px solid var(--border,#27272a);background:var(--bg-tertiary,#18181b);color:var(--text-primary,#fafafa);cursor:pointer;font-size:13px}
      .ui-dialog button:hover{background:var(--bg-elevated,#27272a)}
      .ui-dialog button.ui-dialog-confirm{background:var(--blue-btn,#2563eb);border-color:var(--blue-btn,#2563eb);color:#fff}
      .ui-dialog button.ui-dialog-confirm:hover{background:var(--blue-btn-hover,#1d4ed8)}
      .ui-dialog button.ui-dialog-danger{background:var(--destructive,#dc2626);border-color:var(--destructive,#dc2626);color:#fff}
    `;
    document.head.appendChild(style);
  }

  function focusables(root) {
    return Array.from(root.querySelectorAll(FOCUSABLE)).filter((el) => !el.disabled && el.offsetParent !== null);
  }

  function confirm({ title = 'Confirmar', message = '', confirmLabel = 'Confirmar', danger = false, details = '' } = {}) {
    ensureStyles();
    return new Promise((resolve) => {
      lastFocused = document.activeElement;

      const ov = document.createElement('div');
      ov.className = 'ui-dialog-overlay';
      const dlg = document.createElement('div');
      dlg.className = 'ui-dialog';
      dlg.setAttribute('role', 'alertdialog');
      dlg.setAttribute('aria-modal', 'true');
      dlg.setAttribute('aria-label', title);

      const h = document.createElement('h2');
      h.textContent = title;
      dlg.appendChild(h);

      const p = document.createElement('p');
      p.textContent = message;
      dlg.appendChild(p);

      if (details) {
        const d = document.createElement('p');
        d.className = 'ui-dialog-details';
        d.textContent = details;
        dlg.appendChild(d);
      }

      const actions = document.createElement('div');
      actions.className = 'ui-dialog-actions';

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = 'Cancelar';

      const okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.textContent = confirmLabel;
      okBtn.classList.add(danger ? 'ui-dialog-danger' : 'ui-dialog-confirm');

      actions.appendChild(cancelBtn);
      actions.appendChild(okBtn);
      dlg.appendChild(actions);
      ov.appendChild(dlg);
      document.body.appendChild(ov);
      overlay = ov;

      function done(result) {
        document.removeEventListener('keydown', onKey, true);
        ov.remove();
        if (overlay === ov) overlay = null;
        if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
        resolve(result);
      }

      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); return; }
        if (e.key === 'Tab') {
          const items = focusables(dlg);
          if (!items.length) return;
          const first = items[0];
          const last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
      document.addEventListener('keydown', onKey, true);
      ov.addEventListener('mousedown', (e) => { if (e.target === ov) done(false); });

      cancelBtn.addEventListener('click', () => done(false));
      okBtn.addEventListener('click', () => done(true));

      setTimeout(() => (danger ? cancelBtn : okBtn).focus(), 0);
    });
  }

  function prompt({ title = 'Informar valor', message = '', defaultValue = '', placeholder = '', confirmLabel = 'OK' } = {}) {
    ensureStyles();
    return new Promise((resolve) => {
      lastFocused = document.activeElement;
      const ov = document.createElement('div');
      ov.className = 'ui-dialog-overlay';
      const dlg = document.createElement('div');
      dlg.className = 'ui-dialog';
      dlg.setAttribute('role', 'dialog');
      dlg.setAttribute('aria-modal', 'true');
      dlg.setAttribute('aria-label', title);

      const h = document.createElement('h2');
      h.textContent = title;
      dlg.appendChild(h);

      if (message) {
        const p = document.createElement('p');
        p.textContent = message;
        dlg.appendChild(p);
      }

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'ui-dialog-input';
      input.value = String(defaultValue ?? '');
      if (placeholder) input.placeholder = placeholder;
      dlg.appendChild(input);

      const actions = document.createElement('div');
      actions.className = 'ui-dialog-actions';

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = 'Cancelar';

      const okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.textContent = confirmLabel;
      okBtn.classList.add('ui-dialog-confirm');

      actions.appendChild(cancelBtn);
      actions.appendChild(okBtn);
      dlg.appendChild(actions);
      ov.appendChild(dlg);
      document.body.appendChild(ov);
      overlay = ov;

      function done(val) {
        document.removeEventListener('keydown', onKey, true);
        ov.remove();
        if (overlay === ov) overlay = null;
        if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
        resolve(val);
      }

      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); return; }
        if (e.key === 'Enter' && document.activeElement === input) { e.preventDefault(); done(input.value); return; }
        if (e.key === 'Tab') {
          const items = focusables(dlg);
          if (!items.length) return;
          const first = items[0];
          const last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
      document.addEventListener('keydown', onKey, true);
      ov.addEventListener('mousedown', (e) => { if (e.target === ov) done(null); });
      cancelBtn.addEventListener('click', () => done(null));
      okBtn.addEventListener('click', () => done(input.value));
      setTimeout(() => { input.focus(); input.select(); }, 0);
    });
  }

  window.CDO = window.CDO || {};
  window.CDO.dialog = { confirm, prompt };
})();
