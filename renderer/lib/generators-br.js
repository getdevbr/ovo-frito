(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.generatorsBr = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function generateUuidV4(rng = Math.random) {
    if (rng === Math.random && typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (rng() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function generateRandomCpf(rng = Math.random) {
    const digits = Array.from({ length: 9 }, () => Math.floor(rng() * 10));
    let sum1 = 0;
    for (let i = 0; i < 9; i++) sum1 += digits[i] * (10 - i);
    const d1 = sum1 % 11 < 2 ? 0 : 11 - (sum1 % 11);
    digits.push(d1);

    let sum2 = 0;
    for (let i = 0; i < 10; i++) sum2 += digits[i] * (11 - i);
    const d2 = sum2 % 11 < 2 ? 0 : 11 - (sum2 % 11);
    digits.push(d2);
    return digits.join('');
  }

  function validateCpf(cpf) {
    const clean = String(cpf || '').replace(/\D/g, '');
    if (!/^\d{11}$/.test(clean) || /^(\d)\1{10}$/.test(clean)) return false;
    const digits = clean.split('').map(Number);
    let s1 = 0;
    for (let i = 0; i < 9; i++) s1 += digits[i] * (10 - i);
    const d1 = s1 % 11 < 2 ? 0 : 11 - (s1 % 11);
    if (digits[9] !== d1) return false;
    let s2 = 0;
    for (let i = 0; i < 10; i++) s2 += digits[i] * (11 - i);
    const d2 = s2 % 11 < 2 ? 0 : 11 - (s2 % 11);
    return digits[10] === d2;
  }

  function generateRandomCnpj(rng = Math.random) {
    const digits = Array.from({ length: 8 }, () => Math.floor(rng() * 10));
    digits.push(0, 0, 0, 1);
    const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum1 = 0;
    for (let i = 0; i < 12; i++) sum1 += digits[i] * w1[i];
    const d1 = sum1 % 11 < 2 ? 0 : 11 - (sum1 % 11);
    digits.push(d1);

    const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum2 = 0;
    for (let i = 0; i < 13; i++) sum2 += digits[i] * w2[i];
    const d2 = sum2 % 11 < 2 ? 0 : 11 - (sum2 % 11);
    digits.push(d2);
    return digits.join('');
  }

  function generateRandomCelular(rng = Math.random) {
    const ddds = ['11', '21', '31', '41', '51', '61', '71', '81', '85'];
    const ddd = ddds[Math.floor(rng() * ddds.length)];
    const rest = Array.from({ length: 8 }, () => Math.floor(rng() * 10)).join('');
    return `${ddd}9${rest}`;
  }

  function generateRandomName(rng = Math.random) {
    const firstNames = ['Lucas', 'Mariana', 'Gabriel', 'Beatriz', 'Rafael', 'Camila', 'Thiago', 'Fernanda', 'Bruno', 'Aline'];
    const lastNames = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Costa', 'Ferreira', 'Almeida', 'Pereira', 'Carvalho', 'Ribeiro'];
    const f = firstNames[Math.floor(rng() * firstNames.length)];
    const l = lastNames[Math.floor(rng() * lastNames.length)];
    return `${f} ${l}`;
  }

  function generateRandomEmail(rng = Math.random) {
    const handles = ['usuario', 'cliente', 'dev', 'contato', 'teste', 'qa'];
    const h = handles[Math.floor(rng() * handles.length)];
    const num = Math.floor(100 + rng() * 900);
    return `${h}.${num}@exemplo.com.br`;
  }

  function crc16CcittFalse(str) {
    let crc = 0xffff;
    for (let i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  function emvField(id, value) {
    const len = String(value.length).padStart(2, '0');
    return `${id}${len}${value}`;
  }

  function generateRandomPixPayload(rng = Math.random) {
    const key = generateRandomEmail(rng);
    const merchantAccount = emvField('00', 'br.gov.bcb.pix') + emvField('01', key);
    const txid = 'CDO' + Math.floor(100000 + rng() * 900000);
    const additional = emvField('05', txid);
    const base =
      emvField('00', '01') +
      emvField('26', merchantAccount) +
      emvField('52', '0000') +
      emvField('53', '986') +
      emvField('58', 'BR') +
      emvField('59', 'CARRO DO OVO') +
      emvField('60', 'SAO PAULO') +
      emvField('62', additional) +
      '6304';
    return base + crc16CcittFalse(base);
  }

  function validatePixPayload(payload) {
    const s = String(payload || '');
    if (s.length < 12 || !s.includes('6304')) return false;
    const body = s.slice(0, -4);
    const crc = s.slice(-4);
    return crc16CcittFalse(body) === crc;
  }

  function mod10Boleto(numStr) {
    let sum = 0;
    let weight = 2;
    for (let i = numStr.length - 1; i >= 0; i--) {
      let prod = Number(numStr[i]) * weight;
      if (prod > 9) prod = Math.floor(prod / 10) + (prod % 10);
      sum += prod;
      weight = weight === 2 ? 1 : 2;
    }
    const rem = sum % 10;
    return rem === 0 ? 0 : 10 - rem;
  }

  function mod11Boleto(barCode43) {
    let sum = 0;
    let weight = 2;
    for (let i = barCode43.length - 1; i >= 0; i--) {
      sum += Number(barCode43[i]) * weight;
      weight = weight === 9 ? 2 : weight + 1;
    }
    const dv = 11 - (sum % 11);
    return dv === 0 || dv === 10 || dv === 11 ? 1 : dv;
  }

  function generateRandomBoleto(rng = Math.random) {
    const bank = '001';
    const currency = '9';
    const factor = String(Math.floor(1000 + rng() * 8999));
    const value = String(Math.floor(100 + rng() * 99900)).padStart(10, '0');
    const freeField = Array.from({ length: 25 }, () => Math.floor(rng() * 10)).join('');
    const barWithoutDv = bank + currency + factor + value + freeField;
    const dvGeral = mod11Boleto(barWithoutDv);

    const c1 = bank + currency + freeField.slice(0, 5);
    const dv1 = mod10Boleto(c1);
    const c2 = freeField.slice(5, 15);
    const dv2 = mod10Boleto(c2);
    const c3 = freeField.slice(15, 25);
    const dv3 = mod10Boleto(c3);

    return `${c1}${dv1}${c2}${dv2}${c3}${dv3}${dvGeral}${factor}${value}`;
  }

  function validateBoleto(line) {
    const s = String(line || '').replace(/\D/g, '');
    if (!/^\d{47}$/.test(s)) return false;
    const c1 = s.slice(0, 9);
    const dv1 = Number(s[9]);
    const c2 = s.slice(10, 20);
    const dv2 = Number(s[20]);
    const c3 = s.slice(21, 31);
    const dv3 = Number(s[31]);
    return mod10Boleto(c1) === dv1 && mod10Boleto(c2) === dv2 && mod10Boleto(c3) === dv3;
  }

  function luhnCheckDigit(partial15) {
    let sum = 0;
    let dbl = true;
    for (let i = partial15.length - 1; i >= 0; i--) {
      let d = Number(partial15[i]);
      if (dbl) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
      dbl = !dbl;
    }
    return (10 - (sum % 10)) % 10;
  }

  function generateRandomCartaoCredito(rng = Math.random) {
    const prefixes = ['4', '51', '52', '53', '54', '55'];
    const prefix = prefixes[Math.floor(rng() * prefixes.length)];
    let body = prefix;
    while (body.length < 15) {
      body += String(Math.floor(rng() * 10));
    }
    return body + String(luhnCheckDigit(body));
  }

  function validateLuhn(card) {
    const s = String(card || '').replace(/\D/g, '');
    if (s.length < 13 || s.length > 19) return false;
    let sum = 0;
    let dbl = false;
    for (let i = s.length - 1; i >= 0; i--) {
      let d = Number(s[i]);
      if (dbl) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
      dbl = !dbl;
    }
    return sum % 10 === 0;
  }

  function generateRandomPlacaMercosul(rng = Math.random) {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const L = () => letters[Math.floor(rng() * letters.length)];
    const N = () => String(Math.floor(rng() * 10));
    return `${L()}${L()}${L()}${N()}${L()}${N()}${N()}`;
  }

  function generateRandomCep(rng = Math.random) {
    return Array.from({ length: 8 }, () => Math.floor(rng() * 10)).join('');
  }

  function generateRandomCepFormatado(rng = Math.random) {
    const raw = generateRandomCep(rng);
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  }

  function generateRandomIeSp(rng = Math.random) {
    const d = Array.from({ length: 8 }, () => Math.floor(rng() * 10));
    const w1 = [1, 3, 4, 5, 6, 7, 8, 10];
    let s1 = 0;
    for (let i = 0; i < 8; i++) s1 += d[i] * w1[i];
    const dv1 = (s1 % 11) % 10;
    d.push(dv1);
    d.push(Math.floor(rng() * 10), Math.floor(rng() * 10));
    const w2 = [3, 2, 10, 9, 8, 7, 6, 5, 4, 3, 2];
    let s2 = 0;
    for (let i = 0; i < 11; i++) s2 += d[i] * w2[i];
    const dv2 = (s2 % 11) % 10;
    d.push(dv2);
    return d.join('');
  }

  function validateIeSp(ie) {
    const s = String(ie || '').replace(/\D/g, '');
    if (!/^\d{12}$/.test(s)) return false;
    const d = s.split('').map(Number);
    const w1 = [1, 3, 4, 5, 6, 7, 8, 10];
    let s1 = 0;
    for (let i = 0; i < 8; i++) s1 += d[i] * w1[i];
    if (d[8] !== (s1 % 11) % 10) return false;
    const w2 = [3, 2, 10, 9, 8, 7, 6, 5, 4, 3, 2];
    let s2 = 0;
    for (let i = 0; i < 11; i++) s2 += d[i] * w2[i];
    return d[11] === (s2 % 11) % 10;
  }

  const REGISTRY = [
    { token: '$uuid', label: 'UUID v4', category: 'geral', generate: generateUuidV4 },
    { token: '$guid', label: 'GUID (UUID v4)', category: 'geral', generate: generateUuidV4 },
    { token: '$randomCPF', label: 'CPF Válido', category: 'br', generate: generateRandomCpf, validate: validateCpf },
    { token: '$randomCNPJ', label: 'CNPJ Válido', category: 'br', generate: generateRandomCnpj },
    { token: '$randomCelular', label: 'Celular BR', category: 'br', generate: generateRandomCelular },
    { token: '$randomName', label: 'Nome BR', category: 'br', generate: generateRandomName },
    { token: '$randomEmail', label: 'E-mail', category: 'geral', generate: generateRandomEmail },
    { token: '$randomPixPayload', label: 'PIX Copia-e-Cola', category: 'fintech', generate: generateRandomPixPayload, validate: validatePixPayload },
    { token: '$randomBoleto', label: 'Linha Digitável Boleto', category: 'fintech', generate: generateRandomBoleto, validate: validateBoleto },
    { token: '$randomCartaoCredito', label: 'Cartão de Crédito (Luhn)', category: 'fintech', generate: generateRandomCartaoCredito, validate: validateLuhn },
    { token: '$randomPlacaMercosul', label: 'Placa Mercosul', category: 'br', generate: generateRandomPlacaMercosul },
    { token: '$randomCEP', label: 'CEP (8 dígitos)', category: 'br', generate: generateRandomCep },
    { token: '$randomCEPFormatado', label: 'CEP Formatado', category: 'br', generate: generateRandomCepFormatado },
    { token: '$randomInscricaoEstadualSP', label: 'IE São Paulo (12 dígitos)', category: 'erp', generate: generateRandomIeSp, validate: validateIeSp }
  ];

  const GENERATOR_MAP = Object.fromEntries(REGISTRY.map((g) => [g.token, g.generate]));

  return {
    REGISTRY,
    GENERATOR_MAP,
    generateUuidV4,
    generateRandomCpf,
    validateCpf,
    generateRandomCnpj,
    generateRandomCelular,
    generateRandomName,
    generateRandomEmail,
    crc16CcittFalse,
    generateRandomPixPayload,
    validatePixPayload,
    generateRandomBoleto,
    validateBoleto,
    generateRandomCartaoCredito,
    validateLuhn,
    generateRandomPlacaMercosul,
    generateRandomCep,
    generateRandomCepFormatado,
    generateRandomIeSp,
    validateIeSp
  };
});
