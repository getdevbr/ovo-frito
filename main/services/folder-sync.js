'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const ovoSerializer = require('../../renderer/lib/serializers/ovo');
const { CdoError } = require('../errors');

function sha256(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

function slugify(name) {
  return String(name || 'request')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'request';
}

function resolveSafePath(rootDir, relPath) {
  const resolvedRoot = path.resolve(rootDir);
  const target = path.resolve(resolvedRoot, relPath);
  if (target !== resolvedRoot && !target.startsWith(resolvedRoot + path.sep)) {
    throw new CdoError('PATH_TRAVERSAL', `Caminho fora da pasta sincronizada: ${relPath}`);
  }
  return target;
}

function assertNoSymlinkPath(rootDir, targetPath) {
  const resolvedRoot = path.resolve(rootDir);
  const rel = path.relative(resolvedRoot, targetPath);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return;
  let current = resolvedRoot;
  for (const part of rel.split(path.sep)) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) {
        throw new CdoError('SYMLINK_REJECTED', `Symlink não permitido na sincronização: ${current}`);
      }
    } catch (err) {
      if (err && err.code === 'SYMLINK_REJECTED') throw err;
      break;
    }
  }
}

function createFolderSync({ storage }) {
  const emitter = new EventEmitter();
  const watchers = new Map();
  const writtenHashes = new Map();

  function writeAtomic(filePath, content, rootDir) {
    const dir = path.dirname(filePath);
    if (rootDir) assertNoSymlinkPath(rootDir, filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, content, 'utf8');
    fs.renameSync(tmp, filePath);
    writtenHashes.set(path.resolve(filePath), sha256(content));
  }

  function flushCollection(collection, dirPath) {
    const metaPath = resolveSafePath(dirPath, 'collection.ovo');
    writeAtomic(metaPath, ovoSerializer.serializeCollectionMeta(collection), dirPath);

    for (const item of collection.items || []) {
      const folderParts = String(item.folder || '')
        .split(/[\\/]/)
        .map((s) => s.trim())
        .filter((s) => s && s !== '.' && s !== '..');
      const rel = path.join(...folderParts, `${slugify(item.name)}-${item.id.slice(-4)}.ovo`);
      const itemPath = resolveSafePath(dirPath, rel);
      writeAtomic(itemPath, ovoSerializer.serializeRequest(item), dirPath);
    }
  }

  function enable({ collectionId, dirPath }) {
    const collections = storage.readStore('collections') || [];
    const col = collections.find((c) => c.id === collectionId);
    if (!col) throw new CdoError('NOT_FOUND', `Collection não encontrada: ${collectionId}`);

    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
    flushCollection(col, dirPath);

    if (watchers.has(collectionId)) {
      watchers.get(collectionId).close();
    }

    let debounceTimer = null;
    const watcher = fs.watch(dirPath, { recursive: true }, (_eventType, filename) => {
      if (!filename || !filename.endsWith('.ovo')) return;
      const fullPath = path.resolve(dirPath, filename);
      if (!fullPath.startsWith(path.resolve(dirPath) + path.sep)) return;
      try {
        assertNoSymlinkPath(dirPath, fullPath);
        if (fs.lstatSync(fullPath).isSymbolicLink()) return;
      } catch (err) {
        if (err && err.code === 'SYMLINK_REJECTED') return;
        return;
      }
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (!fs.existsSync(fullPath)) return;
        try {
          assertNoSymlinkPath(dirPath, fullPath);
          if (fs.lstatSync(fullPath).isSymbolicLink()) return;
          const content = fs.readFileSync(fullPath, 'utf8');
          const hash = sha256(content);
          if (writtenHashes.get(fullPath) === hash) {
            return;
          }
          if (path.basename(fullPath) === 'collection.ovo') {
            ovoSerializer.parseCollectionMeta(content);
          } else {
            const parsed = ovoSerializer.parseRequest(content);
            emitter.emit('changed', { collectionId, item: parsed, filePath: fullPath });
          }
        } catch (err) {
          emitter.emit('error', { collectionId, filePath: fullPath, message: err.message });
        }
      }, 150);
      debounceTimer.unref?.();
    });

    watchers.set(collectionId, watcher);
    return { ok: true, dirPath };
  }

  function disable(collectionId) {
    const w = watchers.get(collectionId);
    if (w) {
      w.close();
      watchers.delete(collectionId);
    }
    return { ok: true };
  }

  async function stop() {
    for (const w of watchers.values()) w.close();
    watchers.clear();
  }

  function status() {
    return { activeSyncs: Array.from(watchers.keys()) };
  }

  return {
    enable,
    disable,
    flushCollection,
    resolveSafePath,
    stop,
    status,
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter)
  };
}

module.exports = {
  createFolderSync,
  resolveSafePath
};
