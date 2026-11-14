(function () {
  'use strict';

  function initResponseTable() {
    const btnGroup = document.querySelector('#res-tab-body .res-body-toolbar .btn-group');
    const pre = document.getElementById('responseBodyPre');
    const tabBody = document.getElementById('res-tab-body');
    if (!btnGroup || !pre || !tabBody || document.getElementById('btnViewTable')) return;

    const btnTable = document.createElement('button');
    btnTable.id = 'btnViewTable';
    btnTable.type = 'button';
    btnTable.className = 'btn-toggle';
    btnTable.textContent = '📊 Tabela';
    btnTable.title = 'Visualizar JSON (array de objetos) como tabela ordenável';
    btnGroup.appendChild(btnTable);

    const tableWrap = document.createElement('div');
    tableWrap.id = 'responseTableWrap';
    tableWrap.className = 'hidden';
    tableWrap.style.cssText = 'flex:1; overflow:auto; border:1px solid var(--border-color); border-radius:6px; padding:8px; background:var(--bg-secondary);';
    tabBody.appendChild(tableWrap);

    let tableActive = false;
    let sortState = { colIdx: -1, dir: 'asc' };

    function renderTable() {
      const tab = window.CDO?.app?.getActiveTab?.();
      const raw = tab?.response?.body || '';
      if (!tableActive) {
        tableWrap.classList.add('hidden');
        pre.classList.remove('hidden');
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }

      const tableData = window.CDO.jsonTable.toTable(parsed);
      if (!tableData.ok) {
        tableWrap.innerHTML = '';
        const hint = document.createElement('div');
        hint.className = 'empty-hint';
        hint.textContent = 'Modo Tabela disponível apenas quando a resposta JSON é um array de objetos.';
        tableWrap.appendChild(hint);
        pre.classList.add('hidden');
        tableWrap.classList.remove('hidden');
        return;
      }

      let rows = tableData.rows;
      if (sortState.colIdx >= 0 && sortState.colIdx < tableData.columns.length) {
        rows = window.CDO.jsonTable.sortRows(rows, sortState.colIdx, sortState.dir);
      }

      tableWrap.innerHTML = '';
      const bar = document.createElement('div');
      bar.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;';
      const info = document.createElement('span');
      info.className = 'badge';
      info.textContent = `${rows.length} linha(s) × ${tableData.columns.length} coluna(s)`;
      const btnCsv = document.createElement('button');
      btnCsv.type = 'button';
      btnCsv.className = 'btn-small';
      btnCsv.textContent = '📥 Baixar CSV';
      btnCsv.addEventListener('click', () => {
        const csv = window.CDO.csv.toCsv(tableData.columns, rows);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'response.csv';
        a.click();
        URL.revokeObjectURL(a.href);
      });
      bar.append(info, btnCsv);
      tableWrap.appendChild(bar);

      const table = document.createElement('table');
      table.style.cssText = 'width:100%; border-collapse:collapse; font-size:12px; font-family:var(--font-mono);';
      const thead = document.createElement('thead');
      const trHead = document.createElement('tr');
      tableData.columns.forEach((col, idx) => {
        const th = document.createElement('th');
        th.style.cssText = 'text-align:left; padding:6px 8px; border-bottom:1px solid var(--border-color); cursor:pointer; user-select:none;';
        th.textContent = sortState.colIdx === idx ? `${col} ${sortState.dir === 'asc' ? '▲' : '▼'}` : col;
        th.addEventListener('click', () => {
          if (sortState.colIdx === idx) {
            sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
          } else {
            sortState = { colIdx: idx, dir: 'asc' };
          }
          renderTable();
        });
        trHead.appendChild(th);
      });
      thead.appendChild(trHead);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      const limit = Math.min(rows.length, 500);
      for (let i = 0; i < limit; i++) {
        const tr = document.createElement('tr');
        rows[i].forEach((cell) => {
          const td = document.createElement('td');
          td.style.cssText = 'padding:5px 8px; border-bottom:1px solid var(--border-color); max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
          td.textContent = cell === null || cell === undefined ? '' : String(cell);
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      tableWrap.appendChild(table);

      pre.classList.add('hidden');
      tableWrap.classList.remove('hidden');
    }

    btnTable.addEventListener('click', () => {
      tableActive = true;
      btnTable.classList.add('active');
      document.getElementById('btnViewPretty')?.classList.remove('active');
      document.getElementById('btnViewRaw')?.classList.remove('active');
      renderTable();
    });

    document.getElementById('btnViewPretty')?.addEventListener('click', () => {
      tableActive = false;
      btnTable.classList.remove('active');
      renderTable();
    });

    document.getElementById('btnViewRaw')?.addEventListener('click', () => {
      tableActive = false;
      btnTable.classList.remove('active');
      renderTable();
    });

    if (window.CDO?.hookBus) {
      window.CDO.hookBus.on('response:rendered', renderTable);
    }
  }

  if (window.CDO?.hookBus) {
    window.CDO.hookBus.on('app:ready', initResponseTable);
  } else {
    window.addEventListener('DOMContentLoaded', initResponseTable);
  }
})();
