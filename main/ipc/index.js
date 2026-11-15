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
const db = require('./db');
const git = require('./git');

const REGISTRARS = [storage, runtime, scripts, mock, load, sync, capture, oauth, vault, db, git];

function registerAllIpcHandlers(ctx) {
  for (const register of REGISTRARS) {
    register(ctx);
  }
}

module.exports = { registerAllIpcHandlers };
