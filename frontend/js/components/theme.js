/**
 * Chế độ sáng/tối, lưu lựa chọn trong COOKIE `mc2c_theme`.
 * (File js/theme-init.js chạy sớm trong <head> để áp theme trước khi trang hiện, tránh nháy màu.)
 */
import { setCookie } from '../utils/cookie.js';

export const THEME_COOKIE = 'mc2c_theme';

export const getTheme = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

export function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  setCookie(THEME_COOKIE, theme);
  window.dispatchEvent(new CustomEvent('theme:change', { detail: { theme } }));
}

/** Gắn nút đổi theme, cập nhật icon mặt trăng / mặt trời */
export function initThemeToggle(button) {
  if (!button) return;

  const render = () => {
    const isDark = getTheme() === 'dark';
    button.innerHTML = `<i class="bi ${isDark ? 'bi-sun' : 'bi-moon-stars'}" aria-hidden="true"></i>`;
    button.setAttribute('aria-label', isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối');
    button.setAttribute('aria-pressed', String(isDark));
  };

  button.addEventListener('click', () => {
    setTheme(getTheme() === 'dark' ? 'light' : 'dark');
    render();
  });
  render();
}
