/**
 * Chế độ sáng/tối, lưu lựa chọn trong COOKIE `mc2c_theme`.
 * (File js/theme-init.js chạy sớm trong <head> để áp theme trước khi trang hiện, tránh nháy màu.)
 * Icon mặt trăng / mặt trời có sẵn trong HTML, CSS tự ẩn/hiện theo [data-theme].
 */
import { setCookie } from '../utils/cookie.js';

export const THEME_COOKIE = 'mc2c_theme';

export const getTheme = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

export function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  setCookie(THEME_COOKIE, theme);
  window.dispatchEvent(new CustomEvent('theme:change', { detail: { theme } }));
}

/** Gắn nút đổi theme, chỉ cập nhật thuộc tính trợ năng (aria) */
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
