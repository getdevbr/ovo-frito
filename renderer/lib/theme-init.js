(function () {
  'use strict';
  try {
    var saved = localStorage.getItem('ovofrito_theme');
    if (saved === 'light' || saved === 'dark') {
      document.documentElement.setAttribute('data-theme', saved);
    }
  } catch (e) {
    // ignore storage access errors
  }
})();
