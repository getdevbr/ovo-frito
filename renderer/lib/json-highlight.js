(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.jsonHighlight = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const TOKEN_RE =
    /\s+|"(?:[^"\\\n]|\\.)*"|true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\]:,]|./y;

  function isValidJson(text) {
    try {
      JSON.parse(text);
      return true;
    } catch {
      return false;
    }
  }

  const VAR_RE = /\{\{[^{}]+\}\}/g;

  function varInnerKey(match) {
    return String(match).slice(2, -2).trim();
  }

  // Escapa texto e envolve ocorrências {{var}} em span.var-ok / .var-missing
  // quando `classifier(key)` retornar 'ok' ou 'missing'.
  function decorateVars(raw, classifier) {
    if (!classifier || typeof raw !== 'string' || !raw.includes('{{')) return escapeHtml(raw);
    let html = '';
    let last = 0;
    VAR_RE.lastIndex = 0;
    let m;
    while ((m = VAR_RE.exec(raw)) !== null) {
      html += escapeHtml(raw.slice(last, m.index));
      const verdict = classifier(varInnerKey(m[0]));
      const v = verdict && typeof verdict === 'object' ? verdict.verdict : verdict;
      const title = verdict && typeof verdict === 'object' ? verdict.title : null;
      const cls = typeof v === 'string' && /^[a-z]+$/.test(v) ? `var-${v}` : null;
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
      html += cls
        ? `<span class="${cls}"${titleAttr}>${escapeHtml(m[0])}</span>`
        : escapeHtml(m[0]);
      last = m.index + m[0].length;
    }
    html += escapeHtml(raw.slice(last));
    return html;
  }

  function highlightVars(text, classifier) {
    return decorateVars(String(text ?? ''), classifier);
  }

  function highlightJson(text, { varClassifier } = {}) {
    const src = String(text ?? '');
    const tokens = [];
    let i = 0;
    TOKEN_RE.lastIndex = 0;
    while (i < src.length) {
      TOKEN_RE.lastIndex = i;
      const m = TOKEN_RE.exec(src);
      if (!m || m.index !== i || m[0] === '') {
        tokens.push({ type: 'other', text: src[i] });
        i += 1;
        continue;
      }
      const raw = m[0];
      i += raw.length;
      if (/^\s+$/.test(raw)) {
        tokens.push({ type: 'ws', text: raw });
      } else if (raw.startsWith('"')) {
        tokens.push({ type: 'string', text: raw });
      } else if (/^(true|false|null)$/.test(raw)) {
        tokens.push({ type: 'literal', text: raw });
      } else if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(raw)) {
        tokens.push({ type: 'number', text: raw });
      } else if (/[{}\[\]:,]/.test(raw)) {
        tokens.push({ type: 'punct', text: raw });
      } else {
        tokens.push({ type: 'other', text: raw });
      }
    }

    // marca strings seguidas de ':' como chaves
    const isKey = new Array(tokens.length).fill(false);
    for (let k = 0; k < tokens.length; k++) {
      if (tokens[k].type !== 'string') continue;
      let j = k + 1;
      while (j < tokens.length && tokens[j].type === 'ws') j++;
      if (j < tokens.length && tokens[j].type === 'punct' && tokens[j].text === ':') {
        isKey[k] = true;
      }
    }

    let html = '';
    for (let k = 0; k < tokens.length; k++) {
      const t = tokens[k];
      const esc = escapeHtml(t.text);
      if (t.type === 'ws' || t.type === 'other') {
        html += varClassifier ? decorateVars(t.text, varClassifier) : esc;
      } else if (t.type === 'string') {
        const inner = varClassifier ? decorateVars(t.text, varClassifier) : esc;
        html += isKey[k]
          ? `<span class="json-key">${inner}</span>`
          : `<span class="json-string">${inner}</span>`;
      } else if (t.type === 'number') {
        html += `<span class="json-number">${esc}</span>`;
      } else if (t.type === 'literal') {
        html += `<span class="json-literal">${esc}</span>`;
      } else {
        html += `<span class="json-punct">${esc}</span>`;
      }
    }
    return html;
  }

  return { highlightJson, highlightVars, isValidJson, escapeHtml };
});
