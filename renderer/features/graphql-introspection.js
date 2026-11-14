(function () {
  'use strict';

  const INTROSPECTION_QUERY = `query IntrospectionQuery {
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types { kind name description fields { name description args { name description type { kind name ofType { kind name ofType { kind name } } } } type { kind name ofType { kind name } } } }
  }
}`;

  function app() { return window.CDO?.app || null; }
  function statusEl() { return document.getElementById('statusMessage'); }
  function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function initGraphqlUI() {
    const actions = document.getElementById('reqMoreMenuSlot') || document.querySelector('.request-header-actions');
    if (!actions || document.getElementById('btnOpenGqlModal')) return;
    const btn = document.createElement('button');
    btn.id = 'btnOpenGqlModal'; btn.type = 'button'; btn.className = 'btn-secondary'; btn.textContent = '🧬 GQL'; btn.title = 'Introspecção GraphQL (__schema)';
    actions.appendChild(btn);

    document.body.insertAdjacentHTML('beforeend', `
      <div id="gqlModal" class="modal-backdrop hidden"><div class="modal modal-large">
        <div class="modal-header"><h3>🧬 GraphQL Schema Introspection</h3><button id="btnCloseGqlModal" class="btn-icon">✕</button></div>
        <div class="modal-body">
          <div class="pane-header" style="flex-wrap:wrap;gap:8px;">
            <span id="gqlStatus" style="font-size:12px;color:var(--text-secondary);">Envie a requisição GraphQL ativa para introspecção.</span>
            <button id="btnGqlRun" class="btn-send" style="height:32px;">▶ Introspect</button>
          </div>
          <div id="gqlSchemaView" class="response-pre" style="min-height:280px;max-height:520px;overflow:auto;margin-top:8px;"></div>
        </div>
      </div></div>`);

    const modal = document.getElementById('gqlModal');
    const view = document.getElementById('gqlSchemaView');
    const status = document.getElementById('gqlStatus');

    function typeName(t) {
      if (!t) return 'unknown';
      if (t.kind === 'NON_NULL') return `${typeName(t.ofType)}!`;
      if (t.kind === 'LIST') return `[${typeName(t.ofType)}]`;
      return t.name || t.kind || 'unknown';
    }

    function renderSchema(schema) {
      if (!schema) { view.textContent = 'Sem __schema na resposta.'; return; }
      const lines = [];
      lines.push(`queryType: ${schema.queryType?.name || '-'}`);
      lines.push(`mutationType: ${schema.mutationType?.name || '-'}`);
      lines.push(`subscriptionType: ${schema.subscriptionType?.name || '-'}`);
      lines.push('');
      const rootTypes = new Set([schema.queryType?.name, schema.mutationType?.name, schema.subscriptionType?.name].filter(Boolean));
      for (const t of schema.types || []) {
        if (!t || ['String','Boolean','Int','Float','ID'].includes(t.name)) continue;
        if (t.kind === 'OBJECT' || t.kind === 'INTERFACE' || t.kind === 'INPUT_OBJECT') {
          lines.push(`${t.kind} ${t.name}${rootTypes.has(t.name) ? '  <-- ROOT' : ''}`);
          for (const f of t.fields || []) {
            const args = (f.args || []).map((a) => `${a.name}: ${typeName(a.type)}`).join(', ');
            lines.push(`  ${f.name}(${args}): ${typeName(f.type)}`);
          }
          lines.push('');
        } else if (t.kind === 'ENUM') {
          lines.push(`ENUM ${t.name}: ${(t.enumValues || []).map((e) => e.name).join(', ')}`);
        } else if (t.kind === 'UNION') {
          lines.push(`UNION ${t.name}: ${(t.possibleTypes || []).map((p) => p.name).join(' | ')}`);
        }
      }
      view.innerHTML = `<pre style="margin:0;white-space:pre-wrap;">${esc(lines.join('\n'))}</pre>`;
    }

    btn.addEventListener('click', () => { modal.classList.remove('hidden'); });
    document.getElementById('btnCloseGqlModal').onclick = () => modal.classList.add('hidden');
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

    document.getElementById('btnGqlRun').onclick = async () => {
      const a = app(); const t = a?.getActiveTab?.();
      if (!t) { status.textContent = 'Nenhuma requisição ativa.'; return; }
      status.textContent = 'Executando introspecção...';
      view.textContent = '';
      const temp = a.createBlankTab({
        ...t,
        collectionId: null,
        collectionItemId: null,
        method: 'POST',
        headers: [...(t.headers || []), { key: 'Content-Type', value: 'application/json', enabled: true }],
        body: { mode: 'json', raw: JSON.stringify({ query: INTROSPECTION_QUERY }), urlencoded: [], formdata: [] },
        assertions: [], captures: []
      });
      const res = await a.executeTabRequestObject(temp);
      try {
        const parsed = JSON.parse(res.body || '{}');
        const schema = parsed?.data?.__schema || parsed?.__schema;
        if (schema) { renderSchema(schema); status.textContent = `Schema carregado (${(schema.types || []).length} types).`; }
        else { view.textContent = res.body || '(vazio)'; status.textContent = `Sem __schema. Status ${res.status}.`; }
      } catch {
        view.textContent = res.body || '(vazio)';
        status.textContent = `Resposta não-JSON. Status ${res.status}.`;
      }
    };
  }

  if (window.CDO?.hookBus) window.CDO.hookBus.on('app:ready', initGraphqlUI); else window.addEventListener('DOMContentLoaded', initGraphqlUI);
})();
