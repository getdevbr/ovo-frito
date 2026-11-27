'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const tree = require('../../renderer/lib/collection-tree');

describe('collection-tree', () => {
  it('builds nested tree from slash paths and empty folders', () => {
    const col = {
      id: 'c1',
      folders: ['Empty/Sub'],
      items: [{ id: 'r1', folder: 'Auth/OAuth' }]
    };
    const root = tree.buildTree(col);
    assert.equal(root.folders.get('Auth').folders.get('OAuth').items.length, 1);
    assert.equal(root.folders.get('Empty').folders.get('Sub').items.length, 0);
  });

  it('moves items between collections and folders', () => {
    const cols = [
      { id: 'c1', items: [{ id: 'r1', folder: 'A' }] },
      { id: 'c2', items: [] }
    ];
    assert.equal(tree.moveItem(cols, { itemId: 'r1', toCollectionId: 'c2', toFolder: 'B/C', index: 0 }), true);
    assert.equal(cols[0].items.length, 0);
    assert.equal(cols[1].items[0].folder, 'B/C');
  });

  it('renames folder prefix without touching sibling with similar prefix', () => {
    const col = {
      folders: ['Auth', 'Auth/OAuth', 'Auth2'],
      items: [
        { id: '1', folder: 'Auth/OAuth' },
        { id: '2', folder: 'Auth2' }
      ]
    };
    tree.renameFolder(col, 'Auth', 'Security');
    assert.deepEqual(col.folders, ['Security', 'Security/OAuth', 'Auth2']);
    assert.equal(col.items[0].folder, 'Security/OAuth');
    assert.equal(col.items[1].folder, 'Auth2');
  });

  it('deletes folder in moveToParent and deleteItems modes', () => {
    const col1 = { folders: ['A/B'], items: [{ id: '1', folder: 'A/B' }] };
    tree.deleteFolder(col1, 'A/B', { mode: 'moveToParent' });
    assert.equal(col1.items[0].folder, 'A');

    const col2 = { folders: ['A/B'], items: [{ id: '1', folder: 'A/B' }] };
    tree.deleteFolder(col2, 'A/B', { mode: 'deleteItems' });
    assert.equal(col2.items.length, 0);
  });

  it('creates folder without duplicates and deduplicates on rename', () => {
    const col = { folders: [], items: [] };
    tree.createFolder(col, '  Auth / OAuth ');
    tree.createFolder(col, 'Auth/OAuth');
    assert.deepEqual(col.folders, ['Auth/OAuth']);

    tree.createFolder(col, 'Temp');
    tree.renameFolder(col, 'Temp', 'Auth/OAuth');
    assert.deepEqual(col.folders, ['Auth/OAuth']);
  });
});
