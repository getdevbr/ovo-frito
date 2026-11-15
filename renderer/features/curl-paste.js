(function () {
  'use strict';

  const cd = window.CDO?.curlDetect;
  const importer = window.CDO?.importer;
  if (!cd || !importer?.parseCurlCommand) return;

  const FIELDS = ['method', 'url', 'params', 'headers', 'auth', 'body', 'name'];

  function snapshotTab(tab) {
    const snap = {};
    FIELDS.forEach((f) => { snap[f] = tab[f] ? JSON.parse(JSON.stringify(tab[f])) : tab[f]; });
    return snap;
  }

  function restoreTab(tab, snap) {
    FIELDS.forEach((f) => { tab[f] = snap[f]; });
  }

  function isDirty(tab) {
    if (!tab) return false;
    const hasHeaders = (tab.headers || []).some((h) => h?.key && h.enabled !== false);
    const hasBody = tab.body && tab.body.mode && tab.body.mode !== 'none';
    return Boolean(tab.url || (tab.method && tab.method !== 'GET') || hasHeaders || hasBody || tab.name);
  }

  function applyParsed(tab, parsed) {
    ['method', 'url', 'params', 'headers', 'auth', 'body'].forEach((f) => {
      if (parsed[f] !== undefined) tab[f] = JSON.parse(JSON.stringify(parsed[f]));
    });
    if (parsed.name) tab.name = parsed.name;
  }

  async function handlePaste(e) {
    const text = e.clipboardData?.getData?.('text') || '';
    if (!cd.looksLikeCurl(text)) return;
    e.preventDefault();
    e.stopPropagation();

    const parsed = importer.parseCurlCommand(cd.normalizeWindowsCurl(text));
    if (!parsed || !parsed.url) {
      window.CDO?.toast?.show?.({ message: 'Não foi possível interpretar o comando cURL.', type: 'error' });
      return;
    }

    const app = window.CDO.app;
    const tab = app?.getActiveTab?.();
    if (!tab) return;

    const doApply = async (target) => {
      const before = snapshotTab(target);
      applyParsed(target, parsed);
      app.renderAll();
      app.saveSessionState?.();
      window.CDO?.toast?.show?.({
        message: `Convertido de cURL (${parsed.method} ${parsed.url.slice(0, 60)})`,
        type: 'success',
        action: {
          label: 'Desfazer',
          run: () => {
            restoreTab(target, before);
            app.renderAll();
            app.saveSessionState?.();
          }
        }
      });
    };

    if (isDirty(tab)) {
      const replace = await window.CDO?.dialog?.confirm?.({
        title: 'Colar cURL',
        message: 'A aba atual tem conteúdo. Substituir esta aba pelos dados do cURL?\n(Cancelar abre em nova aba)',
        confirmLabel: 'Substituir',
        danger: false
      });
      if (replace) {
        await doApply(tab);
      } else {
        const nt = app.createBlankTab();
        app.state.tabs.push(nt);
        app.state.activeTabId = nt.id;
        await doApply(nt);
      }
    } else {
      await doApply(tab);
    }
  }

  function init() {
    const urlInput = document.getElementById('reqUrl');
    if (!urlInput || urlInput.dataset.curlPasteBound) return;
    urlInput.dataset.curlPasteBound = '1';
    urlInput.addEventListener('paste', handlePaste);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
