'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { toTable, sortRows } = require('../../renderer/lib/json-table');
const { toCsv } = require('../../renderer/lib/csv');

describe('json-table and csv', () => {
  it('flattens objects and unifies columns', () => {
    const table = toTable([
      { id: 2, user: { name: 'Ana' } },
      { id: 1, extra: 'x' }
    ]);
    assert.equal(table.ok, true);
    assert.deepEqual(table.columns, ['id', 'user.name', 'extra']);
    assert.deepEqual(table.rows[0], [2, 'Ana', '']);
    assert.deepEqual(table.rows[1], [1, '', 'x']);
  });

  it('sorts rows stably', () => {
    const sorted = sortRows([[2, 'b'], [1, 'a']], 0, 'asc');
    assert.deepEqual(sorted, [[1, 'a'], [2, 'b']]);
  });

  it('escapes CSV according to RFC 4180', () => {
    const out = toCsv(['a', 'b'], [['x;y', 'line\n"q"']], { delimiter: ';', bom: false });
    assert.equal(out, 'a;b\r\n"x;y";"line\n""q"""');
  });

  it('handles 10,000 rows x 20 cols under 200ms', () => {
    const big = Array.from({ length: 10000 }, (_, i) => {
      const obj = { id: i };
      for (let c = 1; c < 20; c++) obj[`c${c}`] = `v${i}_${c}`;
      return obj;
    });
    const t0 = performance.now();
    const res = toTable(big);
    const dt = performance.now() - t0;
    assert.equal(res.rows.length, 10000);
    assert.ok(dt < 200, `toTable took ${dt}ms`);
  });
});
