'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const gen = require('../../renderer/lib/generators-br');

describe('generators-br', () => {
  it('generates valid 11-digit CPF', () => {
    const cpf = gen.generateRandomCpf(() => 0.5);
    assert.match(cpf, /^\d{11}$/);
  });

  it('generates valid 14-digit CNPJ', () => {
    const cnpj = gen.generateRandomCnpj(() => 0.3);
    assert.match(cnpj, /^\d{14}$/);
  });

  it('generates UUID v4 format', () => {
    const id = gen.generateUuidV4(() => 0.25);
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('generates BR celular and email', () => {
    assert.match(gen.generateRandomCelular(() => 0.4), /^\d{2}9\d{8}$/);
    assert.match(gen.generateRandomEmail(() => 0.4), /@exemplo\.com\.br$/);
  });
});
