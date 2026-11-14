(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.hooks = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function createHookBus() {
    const listeners = new Map();

    function on(event, handler) {
      if (!event || typeof handler !== 'function') return () => {};
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      const set = listeners.get(event);
      set.add(handler);
      return () => off(event, handler);
    }

    function off(event, handler) {
      const set = listeners.get(event);
      if (!set) return;
      set.delete(handler);
      if (set.size === 0) {
        listeners.delete(event);
      }
    }

    function emit(event, payload) {
      const set = listeners.get(event);
      if (!set) return;
      for (const handler of Array.from(set)) {
        handler(payload);
      }
    }

    async function emitAsync(event, payload) {
      const set = listeners.get(event);
      if (!set) return;
      for (const handler of Array.from(set)) {
        await handler(payload);
      }
    }

    return {
      on,
      off,
      emit,
      emitAsync
    };
  }

  return {
    createHookBus
  };
});
