(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.shortcuts = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MODIFIER_ALIASES = {
    ctrl: 'ctrl', control: 'ctrl', cmd: 'ctrl', command: 'ctrl', meta: 'ctrl',
    shift: 'shift', alt: 'alt', option: 'alt'
  };

  function normalizeKeyName(key) {
    const k = String(key || '').trim();
    if (!k) return '';
    if (k.length === 1) return k.toUpperCase();
    const lower = k.toLowerCase();
    if (lower === 'esc' || lower === 'escape') return 'Escape';
    if (lower === 'enter' || lower === 'return') return 'Enter';
    if (lower === ' ' || lower === 'space' || lower === 'spacebar') return 'Space';
    if (lower === 'arrowup') return 'ArrowUp';
    if (lower === 'arrowdown') return 'ArrowDown';
    if (lower === 'arrowleft') return 'ArrowLeft';
    if (lower === 'arrowright') return 'ArrowRight';
    if (lower === 'tab') return 'Tab';
    if (lower === 'backspace') return 'Backspace';
    if (lower === 'delete') return 'Delete';
    if (lower === 'home') return 'Home';
    if (lower === 'end') return 'End';
    if (lower === 'pageup') return 'PageUp';
    if (lower === 'pagedown') return 'PageDown';
    return k.length === 1 ? k.toUpperCase() : k[0].toUpperCase() + k.slice(1).toLowerCase();
  }

  function parse(binding) {
    if (!binding || typeof binding !== 'string') return null;
    const parts = binding.split('+').map((p) => p.trim()).filter(Boolean);
    if (!parts.length) return null;
    const mods = { ctrl: false, alt: false, shift: false };
    let key = null;
    for (const part of parts) {
      const lower = part.toLowerCase();
      if (MODIFIER_ALIASES[lower] && lower !== 'shift' && lower !== 'alt') {
        if (lower === 'shift') mods.shift = true;
        else if (lower === 'alt' || lower === 'option') mods.alt = true;
        else mods.ctrl = true;
      } else if (lower === 'shift') mods.shift = true;
      else if (lower === 'alt' || lower === 'option') mods.alt = true;
      else if (lower === 'ctrl' || lower === 'control' || lower === 'cmd' || lower === 'command' || lower === 'meta') mods.ctrl = true;
      else key = normalizeKeyName(part);
    }
    if (!key) return null;
    return { ...mods, key };
  }

  function format(parsed) {
    if (!parsed) return null;
    const parts = [];
    if (parsed.ctrl) parts.push('Ctrl');
    if (parsed.alt) parts.push('Alt');
    if (parsed.shift) parts.push('Shift');
    parts.push(parsed.key);
    return parts.join('+');
  }

  function normalize(input, platform) {
    if (typeof input === 'string') return format(parse(input));
    if (input && typeof input === 'object' && input.key) {
      const isMac = platform === 'darwin' || (platform == null && typeof navigator !== 'undefined' && /Mac|iP/.test(navigator.platform || ''));
      const ctrl = Boolean(input.ctrlKey || (isMac && input.metaKey));
      const alt = Boolean(input.altKey);
      const shift = Boolean(input.shiftKey);
      const key = normalizeKeyName(input.key);
      return format({ ctrl, alt, shift, key });
    }
    return null;
  }

  function match(event, binding, platform) {
    const parsed = typeof binding === 'string' ? parse(binding) : binding;
    if (!parsed || !event || !event.key) return false;
    const isMac = platform === 'darwin' || (platform == null && typeof navigator !== 'undefined' && /Mac|iP/.test(navigator.platform || ''));
    const ctrlPressed = Boolean(event.ctrlKey || (isMac && event.metaKey));
    const altPressed = Boolean(event.altKey);
    const shiftPressed = Boolean(event.shiftKey);
    const key = normalizeKeyName(event.key);
    if (key !== parsed.key) return false;
    if (ctrlPressed !== parsed.ctrl) return false;
    if (altPressed !== parsed.alt) return false;
    if (shiftPressed !== parsed.shift) return false;
    return true;
  }

  function canonical(binding) {
    const p = typeof binding === 'string' ? parse(binding) : binding;
    return p ? format(p) : null;
  }

  function findConflicts(bindings) {
    const seen = new Map();
    const conflicts = [];
    Object.entries(bindings || {}).forEach(([commandId, binding]) => {
      const c = canonical(binding);
      if (!c) return;
      if (seen.has(c)) {
        conflicts.push({ binding: c, commands: [seen.get(c), commandId] });
      } else {
        seen.set(c, commandId);
      }
    });
    return conflicts;
  }

  function resolveBindings(defaults, overrides) {
    const out = {};
    Object.entries(defaults || {}).forEach(([id, binding]) => {
      const canon = canonical(binding);
      if (canon) out[id] = canon;
    });
    Object.entries(overrides || {}).forEach(([id, binding]) => {
      if (binding === null || binding === undefined || binding === '') {
        delete out[id];
        return;
      }
      const canon = canonical(binding);
      if (canon) out[id] = canon;
    });
    return out;
  }

  return { parse, format, normalize, match, findConflicts, resolveBindings, normalizeKeyName };
});
