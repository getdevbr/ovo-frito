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
const { createOAuthTokenManager } = require('./oauth-token-manager');
const { createVault } = require('./vault');
const { createSyncDirs } = require('./services/sync-dirs');
const { createGitSync } = require('./services/git-sync');
const { createGitRunner } = require('./services/git-runner');
const { createDbEngine } = require('./db-engine');

/**
 * Composition root compartilhado por main.js (Electron) e server-fallback.js (web).
 * `broadcast(channel, payload)` é opcional — no modo web usa-se no-op.
 * `openExternal(url)` é opcional — no modo web usa-se no-op.
 */
function createAppContext({ dataDir, broadcast = () => {}, openExternal = () => Promise.resolve() } = {}) {
  const storage = createStorage({ dataDir });
  const cookieJar = createCookieJar(storage);
  const vault = createVault({ storage });
  const httpEngine = createHttpEngine({ storage, cookieJar, vault });
  const dbEngine = createDbEngine({ dataDir });
  const serviceManager = new ServiceManager();
  const mockServer = createMockServer({ storage });
  const loadRunner = createLoadRunner({ httpEngine });
  const folderSync = createFolderSync({ storage });
  const proxyInterceptor = createProxyInterceptor({ httpEngine });
  const oauthTokenManager = createOAuthTokenManager({ httpEngine, vault, broadcast });
  httpEngine.setOAuthTokenManager(oauthTokenManager);
  const oauthPkce = createOAuthPkce({ openExternal, httpEngine, oauthTokenManager });
  const syncDirs = createSyncDirs({ storage });
  syncDirs.loadFromStorage();
  const gitRunner = createGitRunner({ baseDir: dataDir });
  const gitSync = createGitSync({ storage, vault, folderSync, syncDirs, gitRunner, dataDir, broadcast });

  serviceManager.register('mock', mockServer);
  serviceManager.register('load', { stop: () => loadRunner.stopAll(), status: () => loadRunner.status() });
  serviceManager.register('sync', folderSync);
  serviceManager.register('capture', proxyInterceptor);
  serviceManager.register('oauth', { stop: () => { oauthPkce.cancel(); oauthTokenManager.stop(); }, status: () => oauthPkce.status() });
  serviceManager.register('vault', { stop: () => vault.lock(), status: () => vault.status() });
  serviceManager.register('db', { stop: () => dbEngine.closeAll(), status: () => ({ ok: true }) });
  serviceManager.register('gitsync', { stop: () => gitSync.stop(), status: () => ({ ok: true, repos: gitSync.listRepos().length }) });

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
    oauthTokenManager,
    oauthPkce,
    vault,
    syncDirs,
    gitRunner,
    gitSync,
    broadcast
  };
}

module.exports = { createAppContext };
