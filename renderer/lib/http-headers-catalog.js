(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.httpHeadersCatalog = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MIME_TYPES = [
    'application/json',
    'application/problem+json',
    'application/xml',
    'application/x-www-form-urlencoded',
    'multipart/form-data',
    'text/plain',
    'text/html',
    'text/csv',
    'application/octet-stream',
    'application/pdf'
  ];

  const HEADERS = [
    { name: 'Accept', desc: 'Tipos de mídia aceitos na resposta', values: MIME_TYPES },
    { name: 'Accept-Charset', desc: 'Codificação de caracteres aceita', values: ['utf-8', 'iso-8859-1'] },
    { name: 'Accept-Encoding', desc: 'Compressão aceita na resposta', values: ['gzip, deflate, br', 'gzip', 'br', 'identity'] },
    { name: 'Accept-Language', desc: 'Idioma preferido na resposta', values: ['pt-BR,pt;q=0.9,en;q=0.8', 'en-US,en;q=0.9', 'pt-BR'] },
    { name: 'Authorization', desc: 'Credenciais de autenticação HTTP', values: ['Bearer ', 'Basic ', 'ApiKey '] },
    { name: 'Cache-Control', desc: 'Diretivas de cache HTTP', values: ['no-cache', 'no-store', 'max-age=0', 'max-age=3600', 'must-revalidate'] },
    { name: 'Connection', desc: 'Controle da conexão TCP', values: ['keep-alive', 'close'] },
    { name: 'Content-Disposition', desc: 'Disposição de conteúdo / nome do arquivo', values: ['attachment; filename="arquivo.json"', 'inline'] },
    { name: 'Content-Encoding', desc: 'Codificação do corpo enviado', values: ['gzip', 'br', 'deflate'] },
    { name: 'Content-Language', desc: 'Idioma do corpo enviado', values: ['pt-BR', 'en-US'] },
    { name: 'Content-Type', desc: 'Tipo MIME do corpo da requisição', values: MIME_TYPES },
    { name: 'Cookie', desc: 'Cookies enviados manualmente', values: [] },
    { name: 'Correlation-Id', desc: 'Identificador de rastreamento distribuído', values: ['{{$uuid}}'] },
    { name: 'Date', desc: 'Data/hora da mensagem HTTP', values: [] },
    { name: 'DNT', desc: 'Do Not Track', values: ['1', '0'] },
    { name: 'ETag', desc: 'Identificador de versão do recurso', values: [] },
    { name: 'Expect', desc: 'Comportamento esperado do servidor', values: ['100-continue'] },
    { name: 'Forwarded', desc: 'Informações de proxy cliente', values: [] },
    { name: 'From', desc: 'Email do responsável pelo cliente', values: [] },
    { name: 'Host', desc: 'Host e porta de destino', values: [] },
    { name: 'Idempotency-Key', desc: 'Chave para evitar duplicidade em POST', values: ['{{$uuid}}'] },
    { name: 'If-Match', desc: 'Condição otimista por ETag', values: ['*'] },
    { name: 'If-Modified-Since', desc: 'Retorna 304 se não modificado após data', values: [] },
    { name: 'If-None-Match', desc: 'Retorna 304 se ETag corresponder', values: ['*'] },
    { name: 'If-Unmodified-Since', desc: 'Executa apenas se não modificado', values: [] },
    { name: 'Max-Forwards', desc: 'Limite de saltos TRACE/OPTIONS', values: ['10'] },
    { name: 'Origin', desc: 'Origem da requisição CORS', values: ['http://localhost:3000'] },
    { name: 'Pragma', desc: 'Compatibilidade HTTP/1.0 de cache', values: ['no-cache'] },
    { name: 'Prefer', desc: 'Preferências de retorno da API', values: ['return=representation', 'return=minimal'] },
    { name: 'Proxy-Authorization', desc: 'Credenciais para proxy HTTP', values: ['Basic '] },
    { name: 'Range', desc: 'Solicita intervalo parcial de bytes', values: ['bytes=0-1023'] },
    { name: 'Referer', desc: 'URL de referência', values: [] },
    { name: 'TE', desc: 'Transfer encodings aceitos', values: ['trailers'] },
    { name: 'Traceparent', desc: 'Contexto W3C Trace Context', values: [] },
    { name: 'Upgrade', desc: 'Upgrade de protocolo', values: ['websocket'] },
    { name: 'User-Agent', desc: 'Identificação do cliente HTTP', values: ['OvoFrito/1.1.0', 'Mozilla/5.0'] },
    { name: 'Via', desc: 'Proxies intermediários', values: [] },
    { name: 'Warning', desc: 'Avisos sobre a mensagem', values: [] },
    { name: 'X-Api-Key', desc: 'Chave de API customizada', values: ['{{api_key}}'] },
    { name: 'X-Api-Version', desc: 'Versão da API', values: ['1', 'v1', '2026-01-01'] },
    { name: 'X-Correlation-ID', desc: 'ID de correlação de logs', values: ['{{$uuid}}'] },
    { name: 'X-CSRF-Token', desc: 'Token anti-CSRF', values: [] },
    { name: 'X-Forwarded-For', desc: 'IP original do cliente atrás de proxy', values: ['127.0.0.1'] },
    { name: 'X-Forwarded-Host', desc: 'Host original atrás de proxy', values: [] },
    { name: 'X-Forwarded-Proto', desc: 'Protocolo original (http/https)', values: ['https', 'http'] },
    { name: 'X-Http-Method-Override', desc: 'Sobrescreve o método HTTP', values: ['PUT', 'PATCH', 'DELETE'] },
    { name: 'X-Mock-Delay', desc: 'Atraso simulado no Mock Server (ms)', values: ['200', '1000'] },
    { name: 'X-Mock-Error-Rate', desc: 'Taxa de erro simulada no Mock (%)', values: ['10', '50'] },
    { name: 'X-Mock-Example', desc: 'Seleciona exemplo nomeado no Mock Server', values: [] },
    { name: 'X-Mock-Status', desc: 'Força status HTTP no Mock Server', values: ['200', '201', '400', '404', '500'] },
    { name: 'X-Request-ID', desc: 'ID único da requisição', values: ['{{$uuid}}'] },
    { name: 'X-Requested-With', desc: 'Identifica chamadas Ajax', values: ['XMLHttpRequest'] },
    { name: 'X-Tenant-ID', desc: 'Identificador do tenant (multi-tenant)', values: [] }
  ];

  function suggestKeys(query = '') {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return HEADERS;
    const starts = HEADERS.filter((h) => h.name.toLowerCase().startsWith(q));
    const contains = HEADERS.filter((h) => !h.name.toLowerCase().startsWith(q) && h.name.toLowerCase().includes(q));
    return [...starts, ...contains];
  }

  function suggestValues(headerKey = '', query = '') {
    const k = String(headerKey || '').trim().toLowerCase();
    const entry = HEADERS.find((h) => h.name.toLowerCase() === k);
    const vals = entry ? entry.values : [];
    const q = String(query || '').trim().toLowerCase();
    if (!q) return vals;
    return vals.filter((v) => v.toLowerCase().includes(q));
  }

  return { HEADERS, MIME_TYPES, suggestKeys, suggestValues };
});
