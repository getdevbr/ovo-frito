'use strict';

const { createStorage } = require('./storage');
const { createCookieJar } = require('./cookie-jar');
const { createHttpEngine } = require('./http-engine');
const { ServiceManager } = require('./services/ServiceManager');
const { createMockServer } = require('./services/mock-server');
const { createLoadRunner } = require('./services/load-runner');
const { createFolderSync } = require('./services/folder-sync');
const { createProxyInterceptor } = require('./services/proxy-interceptor');
const { createOAuthPkce } = require('./oauth-pkce');
const { createVault } = require('./vault');
const { createSyncDirs } = require('./services/sync-dirs');
const { createDbEngine } = require('./db-engine');

/**
 * Composition root compartilhado por main.js (Electron) e server-fallback.js (web).
 * `broadcast(channel, payload)` é opcional — no modo web usa-se no-op.
 * `openExternal(url)` é opcional — no modo web usa-se no-op.
 */
function createAppContext({ dataDir, broadcast = () => {}, openExternal = () => Promise.resolve() } = {}) {
  const storage = createStorage({ dataDir });
  const cookieJar = createCookieJar(storage);
  const httpEngine = createHttpEngine({ storage, cookieJar });
  const dbEngine = createDbEngine({ dataDir });
  const serviceManager = new ServiceManager();
  const mockServer = createMockServer({ storage });
  const loadRunner = createLoadRunner({ httpEngine });
  const folderSync = createFolderSync({ storage });
  const proxyInterceptor = createProxyInterceptor({ httpEngine });
  const oauthPkce = createOAuthPkce({ openExternal, httpEngine });
  const vault = createVault({ storage });
  const syncDirs = createSyncDirs({ storage });
  syncDirs.loadFromStorage();

  serviceManager.register('mock', mockServer);
  serviceManager.register('load', { stop: () => loadRunner.stopAll(), status: () => loadRunner.status() });
  serviceManager.register('sync', folderSync);
  serviceManager.register('capture', proxyInterceptor);
  serviceManager.register('oauth', { stop: () => oauthPkce.cancel(), status: () => oauthPkce.status() });
  serviceManager.register('vault', { stop: () => vault.lock(), status: () => vault.status() });
  serviceManager.register('db', { stop: () => dbEngine.closeAll(), status: () => ({ ok: true }) });

  mockServer.on('log', (entry) => broadcast('pm:mock:log', entry));
  folderSync.on('changed', (payload) => broadcast('pm:sync:changed', payload));
  folderSync.on('error', (payload) => broadcast('pm:sync:conflict', { ...payload, type: 'error' }));
  proxyInterceptor.on('entry', (entry) => broadcast('pm:capture:entry', entry));

  return {
    dataDir,
    storage,
    cookieJar,
    httpEngine,
    dbEngine,
    serviceManager,
    mockServer,
    loadRunner,
    folderSync,
    proxyInterceptor,
    oauthPkce,
    vault,
    syncDirs,
    broadcast
  };
}

module.exports = { createAppContext };
