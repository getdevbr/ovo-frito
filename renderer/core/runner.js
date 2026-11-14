
/* ============================================================================
 * US-11 & US-23: Collection Runner (Execução em Lote + Data File .json/.csv)
 * ============================================================================ */
let activeRunnerCollectionId = null;

let runnerDatasetRows = [];


function parseRunnerCsvData(csvText) {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map((line) => {
    const vals = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
    const obj = {};
    headers.forEach((h, i) => {
      if (h) obj[h] = vals[i] ?? '';
    });
    return obj;
  });
}


async function runCollectionSequentially(col) {
  const items = col?.items || [];
  if (items.length === 0) return;
  activeRunnerCollectionId = col.id;

  document.getElementById('runnerModalTitle').textContent = `▶ Collection Runner — ${col.name}`;
  const summaryBar = document.getElementById('runnerSummaryBar');
  const resultsList = document.getElementById('runnerResultsList');
  const iterations = runnerDatasetRows.length > 0 ? runnerDatasetRows : [null];

  summaryBar.textContent = `Executando ${items.length} requisições × ${iterations.length} iteração(ões)...`;
  resultsList.innerHTML = '';
  document.getElementById('runnerModal').classList.remove('hidden');

  let passedReqs = 0;
  let totalExecs = 0;
  let totalTime = 0;

  for (let iterIdx = 0; iterIdx < iterations.length; iterIdx++) {
    const rowData = iterations[iterIdx];
    state.runnerIterationVars = rowData || null;

    for (const item of items) {
      totalExecs++;
      const tempTab = createBlankTab({ ...item, collectionId: col.id });
      const res = await executeTabRequestObject(tempTab);
      totalTime += res.timeMs || 0;

      const assertions = tempTab.testResults?.assertions || [];
      const captures = tempTab.testResults?.captures || [];
      const allPassed = res.ok && assertions.every((a) => a.passed);
      if (allPassed) passedReqs++;

      const row = document.createElement('div');
      row.className = 'test-result-item';
      const iterBadge = iterations.length > 1 ? `<span class="badge" style="margin-right:4px;">#${iterIdx + 1}</span>` : '';
      const capturesText = captures.length > 0 ? ` | Capturas: ${captures.map((c) => `{{${escapeHtml(c.varName)}}}=${escapeHtml(c.value)}`).join(', ')}` : '';
      row.innerHTML = `
        ${iterBadge}
        <span class="${allPassed ? 'test-badge-pass' : 'test-badge-fail'}">${allPassed ? 'PASS' : 'FAIL'}</span>
        <span class="method-badge method-${escapeHtml(tempTab.method)}">${escapeHtml(tempTab.method)}</span>
        <span style="flex:1;"><strong>${escapeHtml(tempTab.name)}</strong> — Status ${escapeHtml(res.status)} (${escapeHtml(res.timeMs)} ms)${capturesText}</span>
      `;
      resultsList.appendChild(row);
    }
  }

  state.runnerIterationVars = null;
  summaryBar.textContent = `Concluído: ${passedReqs}/${totalExecs} execuções aprovadas (${iterations.length} iteração(ões)) • Tempo total: ${totalTime} ms`;
  renderAll();
}

(function (root) {
  const api = {
    parseRunnerCsvData,
    runCollectionSequentially
  };
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.core = root.CDO.core || {};
    root.CDO.core.runner = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

