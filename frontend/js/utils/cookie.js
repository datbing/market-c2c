/**
 * Đọc/ghi cookie phía client (chỉ dùng cho dữ liệu không nhạy cảm như theme).
 * Session đăng nhập là cookie httpOnly do server quản lý, JS không đọc được.
 */

export function getCookie(name) {
  const pair = document.cookie
    .split('; ')
    .map((item) => item.split('='))
    .find(([key]) => key === name);
  return pair ? decodeURIComponent(pair[1] ?? '') : null;
}

/** Ghi cookie, mặc định sống 1 năm, dùng cho toàn site */
export function setCookie(name, value, { days = 365 } = {}) {
  const maxAge = days * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/; SameSite=Lax`;
}
