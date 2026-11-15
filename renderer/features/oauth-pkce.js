(function () {
  'use strict';

  function app() { return window.CDO?.app || null; }
  function statusEl() { return document.getElementById('statusMessage'); }

  function initOAuthPkceUI() {
    const grantType = document.getElementById('oauthGrantType');
    const pkceFields = document.getElementById('oauthPkceFields');
    const btnPkce = document.getElementById('btnOAuthPkceAuthorize');
    if (!grantType || !btnPkce) return;

    function syncVisibility(tab) {
      const auth = tab?.auth || {};
      const grant = auth.grantType || grantType.value;
      const isPkce = grant === 'authorization_code';
      pkceFields?.classList.toggle('hidden', !isPkce);
      if (pkceFields) pkceFields.style.display = isPkce ? '' : 'none';
      const pwFields = document.getElementById('oauthPasswordFields');
      const isPassword = grant === 'password';
      pwFields?.classList.toggle('hidden', !isPassword);
      if (pwFields) pwFields.style.display = isPassword ? '' : 'none';
    }

    function fillFromTab(tab) {
      const auth = tab?.auth || {};
      const authUrl = document.getElementById('oauthAuthorizationUrl');
      const scopes = document.getElementById('oauthScopes');
      const port = document.getElementById('oauthRedirectPort');
      if (authUrl) authUrl.value = auth.authorizationUrl || '';
      if (scopes) scopes.value = auth.scopes || '';
      if (port) port.value = auth.redirectPort || '';
      syncVisibility(tab);
    }

    grantType.addEventListener('change', () => {
      const tab = app()?.getActiveTab?.();
      if (tab) tab.auth.grantType = grantType.value;
      syncVisibility(tab);
    });

    for (const [id, key] of [['oauthAuthorizationUrl', 'authorizationUrl'], ['oauthScopes', 'scopes'], ['oauthRedirectPort', 'redirectPort']]) {
      document.getElementById(id)?.addEventListener('input', (e) => {
        const tab = app()?.getActiveTab?.();
        if (tab) tab.auth[key] = id === 'oauthRedirectPort' ? Number(e.target.value) || '' : e.target.value;
      });
    }

    btnPkce.addEventListener('click', async () => {
      const a = app(); const tab = a?.getActiveTab?.();
      if (!tab) return;
      if (!tab.auth.authorizationUrl || !tab.auth.tokenUrl || !tab.auth.clientId) {
        if (statusEl()) statusEl().textContent = 'Preencha Authorization URL, Token URL e Client ID para PKCE.';
        return;
      }
      if (statusEl()) statusEl().textContent = 'Aguardando autorização no navegador...';
      const res = await a.ipc.invoke('pm:oauth:pkce:start', {
        authorizationUrl: a.interpolateVariables(tab.auth.authorizationUrl || ''),
        tokenUrl: a.interpolateVariables(tab.auth.tokenUrl || ''),
        clientId: a.interpolateVariables(tab.auth.clientId || ''),
        clientSecret: a.interpolateVariables(tab.auth.clientSecret || ''),
        redirectPort: Number(tab.auth.redirectPort) || 0,
        scopes: a.interpolateVariables(tab.auth.scopes || '')
      });
      if (res?.ok && res.tokens?.access_token) {
        tab.auth.token = String(res.tokens.access_token);
        const tokenInput = document.getElementById('oauthAccessTokenInput');
        if (tokenInput) tokenInput.value = tab.auth.token;
        tab.auth.grantType = 'authorization_code';
        if (statusEl()) statusEl().textContent = 'Access Token PKCE obtido com sucesso!';
        a.saveSessionState?.();
        a.renderAll?.();
        a.updateOAuthExpiryBadge?.(tab);
      } else {
        if (statusEl()) statusEl().textContent = `Falha PKCE: ${res?.error?.message || res?.error || 'erro desconhecido'}`;
      }
    });

    if (window.CDO?.hookBus) {
      window.CDO.hookBus.on('app:ready', () => fillFromTab(app()?.getActiveTab?.()));
      window.CDO.hookBus.on('tab:activated', () => fillFromTab(app()?.getActiveTab?.()));
    } else {
      window.addEventListener('DOMContentLoaded', () => fillFromTab(app()?.getActiveTab?.()));
    }
  }

  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', initOAuthPkceUI); else initOAuthPkceUI();
})();
