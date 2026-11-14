'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const gen = require('../../renderer/lib/generators-br');

describe('generators-br', () => {
  it('generates valid 11-digit CPF', () => {
    let i = 0;
    const rng = () => ((++i * 3) % 10) / 10;
    const cpf = gen.generateRandomCpf(rng);
    assert.match(cpf, /^\d{11}$/);
    assert.equal(gen.validateCpf(cpf), true);
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

  it('computes CRC16-CCITT-FALSE known vector', () => {
    assert.equal(gen.crc16CcittFalse('123456789'), '29B1');
  });

  it('generates valid PIX payload, Boleto, Cartao (Luhn), Placa, CEP, IE-SP', () => {
    for (let i = 0; i < 50; i++) {
      const pix = gen.generateRandomPixPayload();
      assert.equal(gen.validatePixPayload(pix), true);

      const boleto = gen.generateRandomBoleto();
      assert.equal(gen.validateBoleto(boleto), true);

      const card = gen.generateRandomCartaoCredito();
      assert.equal(gen.validateLuhn(card), true);

      const ie = gen.generateRandomIeSp();
      assert.equal(gen.validateIeSp(ie), true);
    }

    assert.match(gen.generateRandomPlacaMercosul(), /^[A-Z]{3}\d[A-Z]\d{2}$/);
    assert.match(gen.generateRandomCep(), /^\d{8}$/);
    assert.match(gen.generateRandomCepFormatado(), /^\d{5}-\d{3}$/);
  });
});
