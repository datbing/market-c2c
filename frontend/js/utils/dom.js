/**
 * Tiện ích thao tác DOM và xử lý sự kiện.
 */

/** querySelector rút gọn */
export const $ = (selector, root = document) => root.querySelector(selector);

/** querySelectorAll trả về mảng thật (dùng được map/filter) */
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escape ký tự đặc biệt trước khi chèn dữ liệu người dùng vào innerHTML (chống XSS).
 * Ví dụ: '<script>' -> '&lt;script&gt;'
 */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/**
 * Debounce: chỉ gọi `fn` sau khi người dùng ngừng thao tác `delay` ms.
 * Dùng cho ô tìm kiếm, ô nhập giá... để không gọi API liên tục mỗi phím gõ.
 */
export function debounce(fn, delay = 400) {
  let timerId;
  const debounced = (...args) => {
    clearTimeout(timerId);
    timerId = setTimeout(() => fn(...args), delay);
  };
  // Cho phép hủy lời gọi đang chờ (vd: khi người dùng bấm Enter thì tìm ngay)
  debounced.cancel = () => clearTimeout(timerId);
  return debounced;
}
