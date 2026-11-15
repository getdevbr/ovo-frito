'use strict';

const { CdoError } = require('../errors');

/**
 * Validação de entrada para Git Sync (US-73).
 * - credentialMode 'userpass': somente https://, sem credenciais embutidas.
 * - credentialMode 'system': https:// ou ssh/scp-like; sem file://, ext::, caminho local.
 */
function validateRepoUrl(rawUrl, { credentialMode = 'userpass' } = {}) {
  const url = String(rawUrl || '').trim();
  if (!url) throw new CdoError('GIT_URL_INVALID', 'URL do repositório obrigatória');
  if (url.startsWith('-')) throw new CdoError('GIT_URL_INVALID', 'URL inválida');
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*::/.test(url) && !/^https?:/i.test(url)) {
    throw new CdoError('GIT_URL_INVALID', 'Scheme de URL não permitido (ext::, file://, etc.)');
  }
  if (/^file:/i.test(url) || /^ext:/i.test(url) || /^[a-zA-Z]:[\\/]/.test(url) || url.startsWith('/') || url.startsWith('\\\\')) {
    throw new CdoError('GIT_URL_INVALID', 'Caminhos locais e file:// não são permitidos');
  }

  const hasEmbeddedCreds = /^https?:\/\/[^/\s]+@/i.test(url);
  if (hasEmbeddedCreds) {
    throw new CdoError('GIT_URL_INVALID', 'Não inclua usuário/senha na URL — use os campos de credencial');
  }

  if (credentialMode === 'userpass') {
    if (!/^https:\/\//i.test(url)) {
      throw new CdoError('GIT_URL_INVALID', 'No modo usuário/senha apenas URLs https:// são aceitas');
    }
    return url;
  }

  // modo sistema: https ou ssh/scp-like
  if (/^https:\/\//i.test(url)) return url;
  if (/^ssh:\/\/[A-Za-z0-9._-]+@[A-Za-z0-9._-]+(\/|:)/.test(url)) return url;
  const sshLike = /^(ssh:\/\/)?[A-Za-z0-9._-]+@[A-Za-z0-9._-]+:[A-Za-z0-9._\/~%-]+(\.git)?\/?$/;
  if (sshLike.test(url)) return url;
  throw new CdoError('GIT_URL_INVALID', 'URL deve ser https:// ou SSH (git@host:org/repo.git)');
}

function validateBranch(rawBranch) {
  const branch = String(rawBranch || '').trim() || 'main';
  if (branch.startsWith('-') || branch.startsWith('/') || branch.endsWith('/') || branch.includes('..') || branch.includes('@{') || /[\s~^:?*[\]\\]/.test(branch)) {
    throw new CdoError('GIT_BRANCH_INVALID', `Nome de branch inválido: ${branch}`);
  }
  return branch;
}

function validateSubdir(rawSubdir) {
  const subdir = String(rawSubdir || '').trim() || '.';
  if (path_isAbsolute(subdir)) {
    throw new CdoError('GIT_SUBDIR_INVALID', 'Subpasta deve ser relativa');
  }
  const parts = subdir.split(/[\\/]+/).filter(Boolean);
  if (parts.some((p) => p === '..' || p === '.git')) {
    throw new CdoError('GIT_SUBDIR_INVALID', 'Subpasta não pode conter ".." ou ".git"');
  }
  return parts.join('/');
}

function path_isAbsolute(p) {
  return p.startsWith('/') || p.startsWith('\\\\') || /^[a-zA-Z]:[\\/]/.test(p);
}

module.exports = { validateRepoUrl, validateBranch, validateSubdir };
