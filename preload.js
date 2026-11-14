const { contextBridge, ipcRenderer } = require('electron');

/**
 * Bridge IPC modelada a partir do `preload_desktop.js` observado no Postman 11.62.7
 * (`window.pm.sdk.IPC` com `invoke`, `send`, `subscribe`).
 */
const ipcBridge = {
  invoke(channel, payload) {
    return ipcRenderer.invoke(channel, payload);
  },
  send(channel, ...args) {
    ipcRenderer.send(channel, ...args);
  },
  subscribe(channel, listener) {
    if (typeof listener !== 'function') return () => {};
    const wrapped = (event, ...args) => listener(event, ...args);
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
