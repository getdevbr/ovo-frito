'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getHint } = require('../../renderer/lib/error-hints');

describe('error-hints', () => {
  it('ECONNREFUSED suggests checking the server', () => {
    const h = getHint({ errorCode: 'ECONNREFUSED', request: { url: 'http://127.0.0.1:59999/x' } });
    assert.equal(h.title, 'O servidor recusou a conexão');
    assert.match(h.message, /127\.0\.0\.1:59999/);
  });

  it('ENOTFOUND and EAI_AGAIN map to host hint', () => {
    for (const code of ['ENOTFOUND', 'EAI_AGAIN']) {
      const h = getHint({ errorCode: code });
      assert.equal(h.title, 'Host não encontrado');
      assert.ok(h.actions.some((a) => a.id === 'request.focusUrl'));
    }
  });

  it('timeout codes map to timeout hint', () => {
    for (const code of ['ETIMEDOUT', 'ESOCKETTIMEDOUT', 'TIMEOUT']) {
      assert.equal(getHint({ errorCode: code }).title, 'A requisição demorou demais');
    }
  });

  it('ECONNRESET offers retry', () => {
    const h = getHint({ errorCode: 'ECONNRESET' });
    assert.ok(h.actions.some((a) => a.id === 'request.retry'));
  });

  it('TLS cert codes map to certificate hint', () => {
    for (const code of ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'CERT_HAS_EXPIRED', 'SELF_SIGNED_CERT_IN_CHAIN']) {
      assert.equal(getHint({ errorCode: code }).title, 'Certificado não confiável', code);
    }
  });

  it('proxy 407 and status hints', () => {
    assert.equal(getHint({ status: 407 }).title, 'Proxy exige autenticação (407)');
    assert.equal(getHint({ status: 401 }).title, 'Não autorizado (401)');
    assert.equal(getHint({ status: 403 }).title, 'Acesso negado (403)');
    assert.equal(getHint({ status: 413 }).title, 'Payload muito grande (413)');
    assert.match(getHint({ status: 500 }).title, /Erro no servidor/);
  });

  it('429 shows Retry-After when present', () => {
    const h = getHint({ status: 429, headers: { 'retry-after': '30' } });
    assert.match(h.message, /30/);
  });

  it('VAULT_LOCKED and VAULT_KEY_NOT_FOUND', () => {
    assert.equal(getHint({ errorCode: 'VAULT_LOCKED' }).title, 'Cofre bloqueado');
    assert.equal(getHint({ errorCode: 'VAULT_KEY_NOT_FOUND' }).title, 'Chave do cofre não encontrada');
  });

  it('unresolved variable in URL yields hint', () => {
    const h = getHint({ errorMessage: 'x', request: { url: 'http://a/{{missing}}' } });
    assert.equal(h.title, 'URL contém variável indefinida');
  });

  it('unknown code returns null', () => {
    assert.equal(getHint({ errorCode: 'SOMETHING_ODD' }), null);
    assert.equal(getHint({}), null);
    assert.equal(getHint({ status: 200 }), null);
  });
});
