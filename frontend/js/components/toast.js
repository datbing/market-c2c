/**
 * Thông báo nhỏ (toast) góc màn hình, tự ẩn sau vài giây.
 *   showToast('Đã lưu', 'success');
 */
import { escapeHtml } from '../utils/dom.js';

const ICONS = {
  info: 'bi-info-circle-fill',
  success: 'bi-check-circle-fill',
  error: 'bi-x-circle-fill',
  warning: 'bi-exclamation-triangle-fill',
};

/** Tạo (một lần) vùng chứa toast; aria-live để trình đọc màn hình đọc thông báo */
function getStack() {
  let stack = document.querySelector('.toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    stack.setAttribute('aria-live', 'polite');
    document.body.append(stack);
  }
  return stack;
}

/**
 * @param {string} message
 * @param {'info'|'success'|'error'|'warning'} [type]
 * @param {number} [duration] ms
 */
export function showToast(message, type = 'info', duration = 3000) {
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.innerHTML = `
    <i class="bi ${ICONS[type] ?? ICONS.info}" aria-hidden="true"></i>
    <p class="toast__message">${escapeHtml(message)}</p>
    <button type="button" class="toast__close" aria-label="Đóng thông báo">
      <i class="bi bi-x-lg" aria-hidden="true"></i>
    </button>`;

  const close = () => {
    toast.classList.add('is-leaving');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    setTimeout(() => toast.remove(), 400); // dự phòng nếu transition bị tắt
  };

  toast.querySelector('.toast__close').addEventListener('click', close);
  getStack().append(toast);
  setTimeout(close, duration);
}
