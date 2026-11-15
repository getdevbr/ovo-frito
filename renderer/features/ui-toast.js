(function () {
  'use strict';

  const MAX_VISIBLE = 3;
  const DEFAULT_DURATION = 6000;
  let container = null;
  const timers = new Map();

  function ensureContainer() {
    if (container && container.isConnected) return container;
    container = document.createElement('div');
    container.id = 'uiToastContainer';
    container.setAttribute('aria-live', 'polite');
    container.style.cssText = [
      'position:fixed', 'right:16px', 'bottom:16px', 'z-index:10000',
      'display:flex', 'flex-direction:column', 'gap:8px', 'max-width:380px'
    ].join(';');
    document.body.appendChild(container);
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const kids = Array.from(container.children);
      const last = kids[kids.length - 1];
      if (last) { e.stopPropagation(); timers.get(last)?.(); }
    });
    return container;
  }

  function typeRole(type) {
    return type === 'error' ? 'alert' : 'status';
  }

  function show({ message, type = 'info', action = null, durationMs = DEFAULT_DURATION } = {}) {
    if (!message) return null;
    ensureContainer();
    const el = document.createElement('div');
    el.className = 'ui-toast';
    el.setAttribute('role', typeRole(type));
    el.style.cssText = [
      'display:flex', 'align-items:center', 'gap:10px',
      'padding:10px 14px', 'border-radius:8px',
      'background:var(--surface, #1e1e2e)', 'color:var(--text, #eee)',
      'border:1px solid var(--border, #333)', 'box-shadow:0 4px 16px rgba(0,0,0,.35)',
      'font-size:13px'
    ].join(';');

    const msg = document.createElement('span');
    msg.style.flex = '1';
    msg.textContent = String(message);
    el.appendChild(msg);

    let actionBtn = null;
    if (action && action.label && typeof action.run === 'function') {
      actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      actionBtn.textContent = action.label;
      actionBtn.style.cssText = 'background:none;border:1px solid currentColor;border-radius:4px;color:inherit;padding:2px 8px;cursor:pointer;font-size:12px';
      actionBtn.addEventListener('click', () => {
        dismiss();
        try { action.run(); } catch (e) { console.error(e); }
      });
      el.appendChild(actionBtn);
    }

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '×';
    closeBtn.setAttribute('aria-label', 'Fechar notificação');
    closeBtn.style.cssText = 'background:none;border:none;color:inherit;cursor:pointer;font-size:16px;line-height:1;padding:0 2px';
    el.appendChild(closeBtn);

    let remaining = durationMs;
    let startedAt = Date.now();
    let timerId = null;

    function arm() {
      if (timerId || remaining <= 0) return;
      startedAt = Date.now();
      timerId = setTimeout(dismiss, remaining);
    }
    function pause() {
      if (!timerId) return;
      clearTimeout(timerId);
      timerId = null;
      remaining = Math.max(0, remaining - (Date.now() - startedAt));
    }
    function resume() {
      if (!el.isConnected || timerId || remaining <= 0) return;
      startedAt = Date.now();
      timerId = setTimeout(dismiss, remaining);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); dismiss(); }
    }
    function dismiss() {
      if (timerId) { clearTimeout(timerId); timerId = null; }
      timers.delete(el);
      el.remove();
      trim();
    }
    function trim() {
      const kids = Array.from(container.children);
      while (kids.length > MAX_VISIBLE) {
        const oldest = kids.shift();
        timers.get(oldest)?.();
      }
    }

    el.addEventListener('mouseenter', pause);
    el.addEventListener('mouseleave', resume);
    el.addEventListener('focusin', pause);
    el.addEventListener('focusout', resume);
    el.addEventListener('keydown', onKey);
    closeBtn.addEventListener('click', dismiss);

    container.appendChild(el);
    timers.set(el, dismiss);
    trim();
    arm();
    return el;
  }

  window.CDO = window.CDO || {};
  window.CDO.toast = { show };
})();
