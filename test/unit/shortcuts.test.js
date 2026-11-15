'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const sc = require('../../renderer/lib/shortcuts');

describe('shortcuts lib', () => {
  it('parse/format round-trip', () => {
    assert.equal(sc.format(sc.parse('Ctrl+Shift+K')), 'Ctrl+Shift+K');
    assert.equal(sc.format(sc.parse('ctrl+alt+delete')), 'Ctrl+Alt+Delete');
    assert.equal(sc.format(sc.parse('Cmd+S')), 'Ctrl+S');
    assert.equal(sc.parse('Ctrl+/').key, '/');
    assert.equal(sc.parse('Ctrl+Space').key, 'Space');
  });

  it('normalize string and event', () => {
    assert.equal(sc.normalize('ctrl+shift+k'), 'Ctrl+Shift+K');
    const ev = { key: 'k', ctrlKey: true, shiftKey: true, altKey: false };
    assert.equal(sc.normalize(ev, 'linux'), 'Ctrl+Shift+K');
    const macEv = { key: 's', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false };
    assert.equal(sc.normalize(macEv, 'darwin'), 'Ctrl+S');
    assert.equal(sc.normalize(macEv, 'linux'), 'S');
  });

  it('match respects modifiers exactly', () => {
    const binding = 'Ctrl+Shift+F';
    assert.equal(sc.match({ key: 'F', ctrlKey: true, shiftKey: true }, binding, 'linux'), true);
    assert.equal(sc.match({ key: 'F', ctrlKey: true, shiftKey: false }, binding, 'linux'), false);
    assert.equal(sc.match({ key: 'F', ctrlKey: false, shiftKey: true }, binding, 'linux'), false);
    assert.equal(sc.match({ key: 'f', ctrlKey: true, shiftKey: true }, binding, 'linux'), true);
  });

  it('match treats metaKey as Ctrl only on darwin', () => {
    const ev = { key: 'K', metaKey: true };
    assert.equal(sc.match(ev, 'Ctrl+K', 'darwin'), true);
    assert.equal(sc.match(ev, 'Ctrl+K', 'linux'), false);
  });

  it('findConflicts detects shared bindings', () => {
    const conflicts = sc.findConflicts({ a: 'Ctrl+K', b: 'ctrl+k', c: 'Ctrl+J' });
    assert.equal(conflicts.length, 1);
    assert.deepEqual(conflicts[0].commands.sort(), ['a', 'b']);
    assert.equal(sc.findConflicts({ a: 'Ctrl+K', b: null, c: 'Ctrl+K' }).length, 1);
  });

  it('resolveBindings merges defaults with overrides; null disables', () => {
    const out = sc.resolveBindings(
      { send: 'Ctrl+Enter', save: 'Ctrl+S' },
      { send: 'Ctrl+Shift+Enter', save: null, extra: 'Ctrl+E' }
    );
    assert.equal(out.send, 'Ctrl+Shift+Enter');
    assert.equal(out.save, undefined);
    assert.equal(out.extra, 'Ctrl+E');
  });
});
