'use strict';

const storage = require('./storage');
const runtime = require('./runtime');
const scripts = require('./scripts');
const mock = require('./mock');
const load = require('./load');
const sync = require('./sync');
const capture = require('./capture');
const oauth = require('./oauth');
const vault = require('./vault');

const REGISTRARS = [storage, runtime, scripts, mock, load, sync, capture, oauth, vault];

function registerAllIpcHandlers(ctx) {
  for (const register of REGISTRARS) {
    register(ctx);
  }
}

module.exports = { registerAllIpcHandlers };
