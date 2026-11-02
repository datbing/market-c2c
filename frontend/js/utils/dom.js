/**
 * DOM and event helpers.
 */

/** Short querySelector */
export const $ = (selector, root = document) => root.querySelector(selector);

/** querySelectorAll returning a real array (map/filter work on it) */
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escape special characters before putting user data into innerHTML (prevents XSS).
 * Example: '<script>' -> '&lt;script&gt;'
 */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/**
 * Debounce: only call `fn` after the user stops for `delay` ms.
 * Used for the search box, price inputs... so the API is not called on every keystroke.
 */
export function debounce(fn, delay = 400) {
  let timerId;
  const debounced = (...args) => {
    clearTimeout(timerId);
    timerId = setTimeout(() => fn(...args), delay);
  };
  // Allows cancelling the pending call (e.g. pressing Enter searches immediately)
  debounced.cancel = () => clearTimeout(timerId);
  return debounced;
}
