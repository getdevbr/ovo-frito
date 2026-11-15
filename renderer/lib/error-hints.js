(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.errorHints = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TLS_CODES = new Set([
    'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'DEPTH_ZERO_SELF_SIGNED_CERT',
    'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_GET_ISSUER_CERT', 'ERR_TLS_CERT_ALTNAME_INVALID',
    'CERT_SIGNATURE_FAILURE', 'CERT_NOT_YET_VALID', 'HOSTNAME_MISMATCH'
  ]);

  function hostPortOf(url) {
    try {
      const u = new URL(String(url || ''));
      return `${u.hostname}:${u.port || (u.protocol === 'https:' ? '443' : '80')}`;
    } catch {
      return String(url || '');
    }
  }

  function statusHint(status, headers) {
    if (!status) return null;
    const h = headers || {};
    if (status === 401) {
      return {
        title: 'Não autorizado (401)',
        message: 'A API rejeitou a autenticação. O token pode ter expirado ou as credenciais estão incorretas.',
        actions: [{ id: 'auth.review', label: 'Revisar Auth' }]
      };
    }
    if (status === 403) {
      return {
        title: 'Acesso negado (403)',
        message: 'Autenticado, mas sem permissão para este recurso. Revise escopos e permissões do token.',
        actions: [{ id: 'auth.review', label: 'Revisar permissões' }]
      };
    }
    if (status === 407) {
      return {
        title: 'Proxy exige autenticação (407)',
        message: 'O proxy configurado recusou a conexão por falta de credenciais.',
        actions: [{ id: 'network.proxy', label: 'Configurar proxy' }]
      };
    }
    if (status === 413) {
      return { title: 'Payload muito grande (413)', message: 'O corpo da requisição excede o limite do servidor.', actions: [] };
    }
    if (status === 429) {
      const retry = h['retry-after'] || h['Retry-After'];
      return {
        title: 'Limite de requisições atingido (429)',
        message: retry ? `Tente novamente em ${retry} s (Retry-After).` : 'Muitas requisições em pouco tempo. Aguarde antes de tentar de novo.',
        actions: []
      };
    }
    if (status >= 500) {
      return {
        title: `Erro no servidor (${status})`,
        message: 'O servidor respondeu com erro interno. Verifique os headers e o corpo da resposta para detalhes.',
        actions: [{ id: 'response.details', label: 'Ver headers da resposta' }]
      };
    }
    return null;
  }

  function codeHint(code, request) {
    switch (code) {
      case 'ECONNREFUSED':
        return {
          title: 'O servidor recusou a conexão',
          message: `Nada está escutando em ${hostPortOf(request?.url)}. Verifique se a API está rodando.`,
          actions: []
        };
      case 'ENOTFOUND':
      case 'EAI_AGAIN':
        return {
          title: 'Host não encontrado',
          message: 'O nome de domínio não resolveu. Confira a URL e variáveis como {{baseUrl}}.',
          actions: [{ id: 'request.focusUrl', label: 'Revisar URL' }]
        };
      case 'ETIMEDOUT':
      case 'ESOCKETTIMEDOUT':
      case 'TIMEOUT':
        return {
          title: 'A requisição demorou demais',
          message: 'O servidor não respondeu dentro do timeout configurado.',
          actions: [{ id: 'settings.timeout', label: 'Aumentar timeout' }]
        };
      case 'ECONNRESET':
        return {
          title: 'Conexão encerrada pelo servidor',
          message: 'O socket foi fechado antes da resposta completa.',
          actions: [{ id: 'request.retry', label: 'Tentar novamente' }]
        };
      case 'ECONNABORTED':
        return {
          title: 'Conexão abortada',
          message: 'A requisição foi cancelada ou o socket caiu.',
          actions: [{ id: 'request.retry', label: 'Tentar novamente' }]
        };
      case 'EHOSTUNREACH':
      case 'ENETUNREACH':
        return {
          title: 'Rede inalcançável',
          message: 'A máquina não conseguiu rota até o destino. Verifique VPN, DNS e firewall.',
          actions: []
        };
      case 'VAULT_LOCKED':
        return {
          title: 'Cofre bloqueado',
          message: 'A requisição usa {{vault.*}} e o cofre está bloqueado.',
          actions: [{ id: 'vault.unlock', label: 'Desbloquear' }]
        };
      case 'VAULT_KEY_NOT_FOUND':
        return {
          title: 'Chave do cofre não encontrada',
          message: 'Uma referência {{vault.*}} aponta para uma chave inexistente.',
          actions: [{ id: 'vault.open', label: 'Abrir Cofre' }]
        };
      default:
        break;
    }
    if (TLS_CODES.has(code) || /CERT_|SELF_SIGNED|UNABLE_TO_VERIFY|DEPTH_ZERO/i.test(String(code))) {
      return {
        title: 'Certificado não confiável',
        message: 'O certificado TLS do servidor não é confiável (expirado, autoassinado ou cadeia inválida).',
        actions: [{ id: 'settings.network', label: 'Configurar SSL/Proxy' }]
      };
    }
    return null;
  }

  function getHint({ errorCode, status, headers, request, errorMessage } = {}) {
    if (errorCode) {
      const hint = codeHint(String(errorCode).toUpperCase(), request);
      if (hint) return hint;
    }
    if (status && status > 0) {
      const hint = statusHint(Number(status), headers);
      if (hint) return hint;
    }
    if (errorMessage && /{{[^}]*}}/.test(String(request?.url || ''))) {
      return {
        title: 'URL contém variável indefinida',
        message: 'A URL ainda tem {{variável}} não resolvida — o valor literal será enviado.',
        actions: [{ id: 'vars.define', label: 'Definir agora' }]
      };
    }
    return null;
  }

  return { getHint, TLS_CODES };
});
