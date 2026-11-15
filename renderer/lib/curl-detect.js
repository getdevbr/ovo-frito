(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.curlDetect = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Detecta comandos cURL colados (bash com \ ou cmd do Windows com ^)
  function looksLikeCurl(text) {
    if (typeof text !== 'string') return false;
    const t = text.trim();
    if (!t) return false;
    return /^curl(\.exe)?(\s|$)/i.test(t);
  }

  // Normaliza continuação de linha do cmd.exe (^) para espaços
  function normalizeWindowsCurl(text) {
    if (typeof text !== 'string') return text;
    return text
      .replace(/\^\r?\n/g, ' ')
      .replace(/\\\r?\n/g, ' ')
      .replace(/\s*\^\s*$/gm, ' ')
      .trim();
  }

  return { looksLikeCurl, normalizeWindowsCurl };
});
