(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.recents = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // move-to-front sem duplicatas, limitado a `max`
  function touch(list, id, max = 10) {
    if (!id) return Array.isArray(list) ? list.slice() : [];
    const out = (Array.isArray(list) ? list : []).filter((x) => x !== id);
    out.unshift(id);
    return out.slice(0, max);
  }

  function toggle(list, id) {
    const arr = Array.isArray(list) ? list.slice() : [];
    const idx = arr.indexOf(id);
    if (idx === -1) arr.push(id);
    else arr.splice(idx, 1);
    return arr;
  }

  function prune(list, existingIds) {
    const set = existingIds instanceof Set ? existingIds : new Set(existingIds || []);
    return (Array.isArray(list) ? list : []).filter((id) => set.has(id));
  }

  function reorder(list, fromIndex, toIndex) {
    const arr = Array.isArray(list) ? list.slice() : [];
    if (fromIndex < 0 || fromIndex >= arr.length || toIndex < 0 || toIndex >= arr.length) return arr;
    const [item] = arr.splice(fromIndex, 1);
    arr.splice(toIndex, 0, item);
    return arr;
  }

  return { touch, toggle, prune, reorder };
});
