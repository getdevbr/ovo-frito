const { contextBridge, ipcRenderer } = require('electron');

/**
 * Bridge IPC modelada a partir do `preload_desktop.js` observado no Postman 11.62.7
 * (`window.pm.sdk.IPC` com `invoke`, `send`, `subscribe`).
 * Endurecida com allowlist explícita de canais (ASVS 5.0 8.2.1).
 */

const ALLOWED_INVOKE_CHANNELS = new Set([
  'pm:storage:loadAll',
  'pm:storage:save',
  'pm:runtime:request',
  'pm:script:run',
  'pm:mock:start',
  'pm:mock:stop',
  'pm:mock:status',
  'pm:load:start',
  'pm:load:stop',
  'pm:sync:pickFolder',
  'pm:sync:enable',
  'pm:sync:disable',
  'pm:sync:flush',
  'pm:sync:status',
  'pm:capture:start',
  'pm:capture:stop',
  'pm:capture:clear',
  'pm:capture:list',
  'pm:oauth:pkce:start',
  'pm:oauth:pkce:cancel',
  'pm:vault:unlock',
  'pm:vault:lock',
  'pm:vault:status',
  'pm:vault:set',
  'pm:vault:get',
  'pm:vault:delete',
  'pm:vault:list',
  'pm:db:query',
  'pm:db:testConnection'
]);

const ALLOWED_SEND_CHANNELS = new Set([]);

const ALLOWED_SUBSCRIBE_CHANNELS = new Set([
  'pm:mock:log',
  'pm:mock:requestLog',
  'pm:sync:changed',
  'pm:sync:conflict',
  'pm:sync:externalChange',
  'pm:capture:entry',
  'pm:proxy:captured',
  'pm:load:progress',
  'pm:load:done'
]);

function assertAllowed(set, channel) {
  if (typeof channel !== 'string' || !set.has(channel)) {
    throw new Error(`Unauthorized IPC channel: ${String(channel)}`);
  }
}

const ipcBridge = {
  invoke(channel, payload) {
    assertAllowed(ALLOWED_INVOKE_CHANNELS, channel);
    return ipcRenderer.invoke(channel, payload);
  },
  send(channel, ...args) {
    assertAllowed(ALLOWED_SEND_CHANNELS, channel);
    ipcRenderer.send(channel, ...args);
  },
  subscribe(channel, listener) {
    assertAllowed(ALLOWED_SUBSCRIBE_CHANNELS, channel);
    if (typeof listener !== 'function') return () => {};
    // Não vaza o objeto IpcRendererEvent para o Renderer (ASVS 5.0 8.2.1)
    const wrapped = (_event, ...args) => listener(null, ...args);
    ipcRenderer.on(channel, wrapped);
    return function unsubscribe() {
      ipcRenderer.removeListener(channel, wrapped);
    };
  }
};

contextBridge.exposeInMainWorld('pm', {
  sdk: {
    IPC: ipcBridge
  }
});
