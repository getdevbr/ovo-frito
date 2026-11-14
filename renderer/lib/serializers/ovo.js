(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.serializers = root.CDO.serializers || {};
    root.CDO.serializers.ovo = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function sortKeysDeep(val) {
    if (Array.isArray(val)) return val.map(sortKeysDeep);
    if (val !== null && typeof val === 'object') {
      const out = {};
      for (const k of Object.keys(val).sort()) {
        if (val[k] !== undefined) out[k] = sortKeysDeep(val[k]);
      }
      return out;
    }
    return val;
  }

  function serializeRequest(item) {
    const clean = {
      kind: 'carro-do-ovo-request',
      version: 1,
      id: item.id,
      name: item.name || 'Sem Nome',
      folder: item.folder || '',
      method: item.method || 'GET',
      url: item.url || '',
      params: item.params || [],
      headers: item.headers || [],
      auth: item.auth || { type: 'none' },
      body: item.body || { mode: 'none' },
      assertions: item.assertions || [],
      captures: item.captures || [],
      preRequestScript: item.preRequestScript || '',
      postResponseScript: item.postResponseScript || '',
      contract: item.contract || null,
      mockExamples: item.mockExamples || []
    };
    return JSON.stringify(sortKeysDeep(clean), null, 2) + '\n';
  }

  function parseRequest(rawText) {
    const obj = JSON.parse(rawText);
    if (!obj || typeof obj !== 'object') throw new Error('Arquivo .ovo inválido');
    return {
      id: obj.id,
      name: obj.name || 'Sem Nome',
      folder: obj.folder || '',
      method: obj.method || 'GET',
      url: obj.url || '',
      params: Array.isArray(obj.params) ? obj.params : [],
      headers: Array.isArray(obj.headers) ? obj.headers : [],
      auth: obj.auth || { type: 'none' },
      body: obj.body || { mode: 'none' },
      assertions: Array.isArray(obj.assertions) ? obj.assertions : [],
      captures: Array.isArray(obj.captures) ? obj.captures : [],
      preRequestScript: obj.preRequestScript || '',
      postResponseScript: obj.postResponseScript || '',
      contract: obj.contract || null,
      mockExamples: Array.isArray(obj.mockExamples) ? obj.mockExamples : []
    };
  }

  function serializeCollectionMeta(col) {
    const cleanVars = (col.variables || []).map((v) => ({
      key: v.key,
      value: v.secret ? '' : v.value,
      enabled: v.enabled !== false,
      secret: Boolean(v.secret)
    }));
    const clean = {
      kind: 'carro-do-ovo-collection-meta',
      version: 1,
      id: col.id,
      name: col.name,
      auth: col.auth || { type: 'none' },
      folders: col.folders || [],
      variables: cleanVars
    };
    return JSON.stringify(sortKeysDeep(clean), null, 2) + '\n';
  }

  function parseCollectionMeta(rawText) {
    const obj = JSON.parse(rawText);
    if (!obj || typeof obj !== 'object') throw new Error('collection.ovo inválido');
    return obj;
  }

  return {
    ext: '.ovo',
    serializeRequest,
    parseRequest,
    serializeCollectionMeta,
    parseCollectionMeta
  };
});
