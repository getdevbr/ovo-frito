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

  return {
    generateUuidV4,
    generateRandomCpf,
    generateRandomCnpj,
    generateRandomCelular,
    generateRandomName,
    generateRandomEmail
  };
});
