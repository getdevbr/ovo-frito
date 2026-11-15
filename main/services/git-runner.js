'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { CdoError } = require('../errors');

const ASKPASS_JS = `'use strict';
const prompt = String(process.argv[2] || '');
if (/username/i.test(prompt)) {
  process.stdout.write(String(process.env.OVO_GIT_USERNAME || ''));
} else {
  process.stdout.write(String(process.env.OVO_GIT_PASSWORD || ''));
}
`;

function createGitRunner({ baseDir, allowFileProtocol = false } = {}) {
  const askpassDir = path.join(baseDir || process.cwd(), '.askpass');
  const hooksDir = path.join(baseDir || process.cwd(), '.hooks-empty');

  function ensureDirs() {
    fs.mkdirSync(askpassDir, { recursive: true });
    fs.mkdirSync(hooksDir, { recursive: true });
    try { fs.chmodSync(askpassDir, 0o700); } catch {}
  }

  function askpassPaths() {
    ensureDirs();
    const jsPath = path.join(askpassDir, 'askpass.js');
    fs.writeFileSync(jsPath, ASKPASS_JS, 'utf8');
    const isWin = process.platform === 'win32';
    const wrapperPath = path.join(askpassDir, isWin ? 'askpass.cmd' : 'askpass.sh');
    const execPath = process.execPath.replace(/"/g, '');
    const content = isWin
      ? `@echo off\r\nset "ELECTRON_RUN_AS_NODE=1"\r\n"${execPath}" "${jsPath}" %*\r\n`
      : `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec "${execPath}" "${jsPath}" "$@"\n`;
    fs.writeFileSync(wrapperPath, content, 'utf8');
    if (!isWin) {
      try { fs.chmodSync(wrapperPath, 0o700); } catch {}
    }
    return wrapperPath;
  }

  function baseGitArgs() {
    const args = ['-c', 'protocol.ext.allow=never', '-c', `core.hooksPath=${hooksDir}`];
    if (!allowFileProtocol) args.splice(1, 0, '-c', 'protocol.file.allow=never');
    return args;
  }

  function buildEnv({ credentialMode = 'userpass', username = '', password = '' } = {}) {
    const env = {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GIT_CONFIG_NOSYSTEM: '1'
    };
    delete env.GIT_ASKPASS;
    delete env.SSH_ASKPASS;
    delete env.OVO_GIT_USERNAME;
    delete env.OVO_GIT_PASSWORD;
    if (credentialMode === 'userpass') {
      env.GCM_INTERACTIVE = 'never';
      env.GIT_ASKPASS = askpassPaths();
      env.ELECTRON_RUN_AS_NODE = '1';
      env.OVO_GIT_USERNAME = String(username || '');
      env.OVO_GIT_PASSWORD = String(password || '');
      return { env, prefixArgs: ['-c', 'credential.helper='] };
    }
    return { env, prefixArgs: [] };
  }

  function redact(text, secrets = []) {
    let out = String(text || '');
    for (const s of secrets) {
      const secret = String(s || '');
      if (secret && secret.length >= 4) {
        out = out.split(secret).join('••••');
      }
    }
    out = out.replace(/(https?:\/\/)[^/\s:]+:[^@\s]+@/gi, '$1');
    return out;
  }

  function runGit(args, { cwd, env = {}, timeoutMs = 120000 } = {}) {
    return new Promise((resolve) => {
      const fullArgs = [...baseGitArgs(), ...args];
      execFile('git', fullArgs, { cwd, env, timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
        const secrets = [env.OVO_GIT_PASSWORD, env.OVO_GIT_USERNAME].filter(Boolean);
        const out = redact(stdout, secrets).trim();
        const errOut = redact(stderr, secrets).trim();
        if (error) {
          const code = error.killed ? 'GIT_TIMEOUT' : (error.code === 'ENOENT' ? 'GIT_NOT_FOUND' : 'GIT_ERROR');
          return resolve({
            ok: false,
            code,
            message: redact(error.message, secrets),
            stdout: out,
            stderr: errOut,
            exitCode: typeof error.code === 'number' ? error.code : null
          });
        }
        resolve({ ok: true, stdout: out, stderr: errOut, exitCode: 0 });
      });
    });
  }

  function detectGit() {
    return new Promise((resolve) => {
      execFile('git', ['--version'], { timeout: 10000, windowsHide: true }, (error, stdout) => {
        if (error) return resolve({ ok: false, code: 'GIT_NOT_FOUND', message: 'Git não encontrado no PATH. Instale o Git (https://git-scm.com) e tente novamente.' });
        resolve({ ok: true, version: String(stdout || '').trim() });
      });
    });
  }

  return { runGit, detectGit, buildEnv, redact, baseGitArgs, askpassPaths };
}

module.exports = { createGitRunner };
