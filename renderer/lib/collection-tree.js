(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.collectionTree = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function normalizeFolderPath(folderPath) {
    return String(folderPath || '')
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean)
      .join('/');
  }

  function buildTree(collection) {
    const rootNode = { name: '', path: '', folders: new Map(), items: [] };
    const ensureFolder = (folderPath) => {
      const norm = normalizeFolderPath(folderPath);
      if (!norm) return rootNode;
      const parts = norm.split('/');
      let curr = rootNode;
      let acc = '';
      for (const part of parts) {
        acc = acc ? `${acc}/${part}` : part;
        if (!curr.folders.has(part)) {
          curr.folders.set(part, { name: part, path: acc, folders: new Map(), items: [] });
        }
        curr = curr.folders.get(part);
      }
      return curr;
    };

    for (const f of collection?.folders || []) {
      ensureFolder(f);
    }
    for (const item of collection?.items || []) {
      const target = ensureFolder(item.folder || '');
      target.items.push(item);
    }
    return rootNode;
  }

  function moveItem(collections, { itemId, toCollectionId, toFolder = '', index = -1 }) {
    let moved = null;
    for (const col of collections) {
      const idx = (col.items || []).findIndex((i) => i.id === itemId);
      if (idx !== -1) {
        [moved] = col.items.splice(idx, 1);
        break;
      }
    }
    if (!moved) return false;
    const destCol = collections.find((c) => c.id === toCollectionId);
    if (!destCol) return false;
    moved.folder = normalizeFolderPath(toFolder);
    destCol.items = destCol.items || [];
    if (index >= 0 && index <= destCol.items.length) {
      destCol.items.splice(index, 0, moved);
    } else {
      destCol.items.push(moved);
    }
    return true;
  }

  function renameFolder(collection, oldPath, newPath) {
    const oldNorm = normalizeFolderPath(oldPath);
    const newNorm = normalizeFolderPath(newPath);
    if (!oldNorm || !newNorm || oldNorm === newNorm) return;

    const replacePrefix = (p) => {
      const norm = normalizeFolderPath(p);
      if (norm === oldNorm) return newNorm;
      if (norm.startsWith(`${oldNorm}/`)) return `${newNorm}${norm.slice(oldNorm.length)}`;
      return norm;
    };

    if (Array.isArray(collection.folders)) {
      const seen = new Set();
      collection.folders = collection.folders
        .map(replacePrefix)
        .filter((f) => {
          if (!f || seen.has(f)) return false;
          seen.add(f);
          return true;
        });
    }
    for (const item of collection.items || []) {
      if (item.folder) item.folder = replacePrefix(item.folder);
    }
  }

  function deleteFolder(collection, folderPath, { mode = 'moveToParent' } = {}) {
    const norm = normalizeFolderPath(folderPath);
    if (!norm) return;
    const parent = norm.includes('/') ? norm.slice(0, norm.lastIndexOf('/')) : '';

    if (Array.isArray(collection.folders)) {
      collection.folders = collection.folders.filter((f) => {
        const fn = normalizeFolderPath(f);
        return fn !== norm && !fn.startsWith(`${norm}/`);
      });
    }

    if (mode === 'deleteItems') {
      collection.items = (collection.items || []).filter((item) => {
        const fn = normalizeFolderPath(item.folder);
        return fn !== norm && !fn.startsWith(`${norm}/`);
      });
    } else {
      for (const item of collection.items || []) {
        const fn = normalizeFolderPath(item.folder);
        if (fn === norm || fn.startsWith(`${norm}/`)) {
          item.folder = parent;
        }
      }
    }
  }

  function createFolder(collection, folderPath) {
    const norm = normalizeFolderPath(folderPath);
    if (!norm) return;
    collection.folders = collection.folders || [];
    if (!collection.folders.includes(norm)) {
      collection.folders.push(norm);
    }
  }

  return {
    normalizeFolderPath,
    buildTree,
    moveItem,
    renameFolder,
    deleteFolder,
    createFolder
  };
});
