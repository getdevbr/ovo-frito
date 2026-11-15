(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.commands = api.commands;
    root.CDO.createCommandRegistry = api.createCommandRegistry;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function createCommandRegistry() {
    const commands = new Map();

    function register(def) {
      if (!def || typeof def !== 'object') throw new Error('command definition must be an object');
      if (!def.id || typeof def.id !== 'string') throw new Error('command requires an id');
      if (typeof def.run !== 'function') throw new Error(`command "${def.id}" requires run()`);
      if (commands.has(def.id)) throw new Error(`duplicate command id: ${def.id}`);
      commands.set(def.id, {
        id: def.id,
        title: def.title || def.id,
        category: def.category || 'Geral',
        sub: def.sub || '',
        run: def.run,
        when: typeof def.when === 'function' ? def.when : () => true,
        defaultKeys: def.defaultKeys || null
      });
      return commands.get(def.id);
    }

    function get(id) {
      return commands.get(id) || null;
    }

    function isEnabled(cmd) {
      try { return cmd.when() !== false; } catch { return false; }
    }

    function list() {
      return Array.from(commands.values()).filter(isEnabled);
    }

    function execute(id, ...args) {
      const cmd = commands.get(id);
      if (!cmd) throw new Error(`unknown command: ${id}`);
      if (!isEnabled(cmd)) return undefined;
      return cmd.run(...args);
    }

    return { register, list, get, execute };
  }

  return {
    createCommandRegistry,
    commands: createCommandRegistry()
  };
});
