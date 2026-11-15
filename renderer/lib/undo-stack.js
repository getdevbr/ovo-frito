(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.undoStack = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function createUndoStack({ limit = 50 } = {}) {
    const undoArr = [];
    const redoArr = [];

    function push(entry) {
      undoArr.push(entry);
      if (undoArr.length > limit) undoArr.shift();
      redoArr.length = 0;
    }

    function undo() {
      if (!undoArr.length) return undefined;
      const entry = undoArr.pop();
      redoArr.push(entry);
      if (redoArr.length > limit) redoArr.shift();
      return entry;
    }

    function redo() {
      if (!redoArr.length) return undefined;
      const entry = redoArr.pop();
      undoArr.push(entry);
      return entry;
    }

    return {
      push,
      undo,
      redo,
      canUndo: () => undoArr.length > 0,
      canRedo: () => redoArr.length > 0,
      size: () => ({ undo: undoArr.length, redo: redoArr.length })
    };
  }

  return { createUndoStack };
});
