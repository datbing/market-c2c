/**
 * Light/dark mode, the choice is stored in the `mc2c_theme` COOKIE.
 * (js/theme-init.js runs early in <head> to apply the theme before the page shows, avoiding a color flash.)
 * The moon / sun icons are in the HTML, CSS shows/hides them based on [data-theme].
 */
import { setCookie } from '../utils/cookie.js';

export const THEME_COOKIE = 'mc2c_theme';

export const getTheme = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

export function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  setCookie(THEME_COOKIE, theme);
  window.dispatchEvent(new CustomEvent('theme:change', { detail: { theme } }));
}

/** Wire up the theme toggle button, only updates the accessibility (aria) attributes */
export function initThemeToggle(button) {
  if (!button) return;

  const syncAria = () => {
    const isDark = getTheme() === 'dark';
    button.setAttribute('aria-pressed', String(isDark));
    button.setAttribute('aria-label', isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối');
  };

  button.addEventListener('click', () => {
    setTheme(getTheme() === 'dark' ? 'light' : 'dark');
    syncAria();
  });
  syncAria();
}
