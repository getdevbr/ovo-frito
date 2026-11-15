'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createCommandRegistry } = require('../../renderer/lib/command-registry');

describe('command-registry', () => {
  it('registers, lists and executes a command', () => {
    const reg = createCommandRegistry();
    let ran = 0;
    reg.register({ id: 'a.b', title: 'Do B', category: 'Cat', run: () => { ran++; return 42; } });
    assert.equal(reg.list().length, 1);
    assert.equal(reg.get('a.b').title, 'Do B');
    assert.equal(reg.execute('a.b'), 42);
    assert.equal(ran, 1);
  });

  it('rejects duplicate ids and missing run', () => {
    const reg = createCommandRegistry();
    reg.register({ id: 'x', run: () => {} });
    assert.throws(() => reg.register({ id: 'x', run: () => {} }), /duplicate/);
    assert.throws(() => reg.register({ id: 'y' }), /run/);
    assert.throws(() => reg.register({}), /id/);
  });

  it('when() === false hides from list and blocks execute', () => {
    const reg = createCommandRegistry();
    let ran = 0;
    reg.register({ id: 'hidden', run: () => { ran++; }, when: () => false });
    reg.register({ id: 'shown', run: () => { ran++; } });
    assert.deepEqual(reg.list().map((c) => c.id), ['shown']);
    assert.equal(reg.execute('hidden'), undefined);
    assert.equal(ran, 0);
    reg.execute('shown');
    assert.equal(ran, 1);
  });

  it('execute throws on unknown id and passes args', () => {
    const reg = createCommandRegistry();
    reg.register({ id: 'sum', run: (a, b) => a + b });
    assert.equal(reg.execute('sum', 2, 3), 5);
    assert.throws(() => reg.execute('nope'), /unknown command/);
  });

  it('when() throwing is treated as disabled', () => {
    const reg = createCommandRegistry();
    reg.register({ id: 'boom', run: () => {}, when: () => { throw new Error('x'); } });
    assert.equal(reg.list().length, 0);
  });
});
