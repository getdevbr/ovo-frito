(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.contentSniff = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TEXTUAL_TYPES = [
    /^text\//i,
    /^application\/json/i,
    /^application\/xml/i,
    /^application\/javascript/i,
    /^application\/x-www-form-urlencoded/i,
    /\+json$/i,
    /\+xml$/i
  ];

  const BINARY_TYPES = [
    /^image\//i,
    /^audio\//i,
    /^video\//i,
    /^application\/pdf/i,
    /^application\/zip/i,
    /^application\/octet-stream/i
  ];

  function isTextual(contentType, firstBytes) {
    const ct = String(contentType || '').split(';')[0].trim().toLowerCase();
    if (ct) {
      if (BINARY_TYPES.some((re) => re.test(ct))) return false;
      if (TEXTUAL_TYPES.some((re) => re.test(ct))) return true;
    }
    if (firstBytes && firstBytes.length > 0) {
      const len = Math.min(firstBytes.length, 512);
      for (let i = 0; i < len; i++) {
        if (firstBytes[i] === 0) return false;
      }
    }
    return true;
  }

  function extensionFromContentType(contentType) {
    const ct = String(contentType || '').split(';')[0].trim().toLowerCase();
    const map = {
      'application/json': 'json',
      'text/html': 'html',
      'text/plain': 'txt',
      'text/csv': 'csv',
      'application/pdf': 'pdf',
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
      'image/svg+xml': 'svg',
      'application/zip': 'zip'
    };
    return map[ct] || 'bin';
  }

  return {
    isTextual,
    extensionFromContentType
  };
});
