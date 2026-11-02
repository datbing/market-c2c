/**
 * Runs SYNCHRONOUSLY in <head> (not a module) to set the theme before the browser paints,
 * avoiding a white flash before switching to dark.
 * Priority: mc2c_theme cookie -> operating system setting.
 */
(function applyInitialTheme() {
  var match = document.cookie.match(/(?:^|;\s*)mc2c_theme=(dark|light)/);
  var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = match ? match[1] : prefersDark ? 'dark' : 'light';
})();
