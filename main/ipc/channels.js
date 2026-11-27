'use strict';

/**
 * Fonte única dos canais IPC. preload.js é sandboxed e não pode fazer require
 * de arquivos locais — a paridade é garantida por test/unit/ipc-channels.test.js.
 */
const INVOKE_CHANNELS = [
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
  'pm:oauth:token:fetch',
  'pm:oauth:token:status',
  'pm:oauth:token:clear',
  'pm:vault:unlock',
  'pm:vault:lock',
  'pm:vault:status',
  'pm:vault:set',
  'pm:vault:get',
  'pm:vault:delete',
  'pm:vault:list',
  'pm:db:query',
  'pm:db:testConnection',
  'pm:git:detect',
  'pm:git:testConnection',
  'pm:git:connect',
  'pm:git:list',
  'pm:git:status',
  'pm:git:pull',
  'pm:git:push',
  'pm:git:sync',
  'pm:git:resolveConflict',
  'pm:git:disconnect',
  'pm:git:setCredentials',
  'pm:git:clearCredentials',
  'pm:backup:export',
  'pm:backup:preview',
  'pm:backup:restore'
];

const SEND_CHANNELS = [];

const SUBSCRIBE_CHANNELS = [
  'pm:mock:log',
  'pm:mock:requestLog',
  'pm:sync:changed',
  'pm:sync:conflict',
  'pm:sync:externalChange',
  'pm:capture:entry',
  'pm:proxy:captured',
  'pm:load:progress',
  'pm:load:done',
  'pm:oauth:token:refreshed',
  'pm:git:progress',
  'pm:git:conflict',
  'pm:git:synced'
];

module.exports = { INVOKE_CHANNELS, SEND_CHANNELS, SUBSCRIBE_CHANNELS };
