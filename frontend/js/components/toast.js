/**
 * Thông báo nhỏ (toast) góc màn hình, tự ẩn sau vài giây.
 * Cần có trong trang: <div class="toast-stack" id="toast-stack"> và <template id="tpl-toast">.
 *   showToast('Đã lưu', 'success');
 */
import { cloneTemplate } from '../utils/template.js';

const ICONS = {
  info: 'bi-info-circle-fill',
  success: 'bi-check-circle-fill',
  error: 'bi-x-circle-fill',
  warning: 'bi-exclamation-triangle-fill',
};

/**
 * @param {string} message
 * @param {'info'|'success'|'error'|'warning'} [type]
 * @param {number} [duration] ms
 */
export function showToast(message, type = 'info', duration = 3000) {
  const toast = cloneTemplate('tpl-toast');
  toast.classList.add(`toast--${type}`);
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.querySelector('.toast__icon').classList.add(ICONS[type] ?? ICONS.info);
  toast.querySelector('.toast__message').textContent = message;

  const close = () => {
    toast.classList.add('is-leaving');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    setTimeout(() => toast.remove(), 400); // dự phòng nếu transition bị tắt
  };

  toast.querySelector('.toast__close').addEventListener('click', close);
  document.getElementById('toast-stack').append(toast);
  setTimeout(close, duration);
}
