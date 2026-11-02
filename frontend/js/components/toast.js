/**
 * Small notification (toast) in the corner of the screen, hides itself after a few seconds.
 * The page needs: <div class="toast-stack" id="toast-stack"> and <template id="tpl-toast">.
 *   showToast('Saved', 'success');
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
    setTimeout(() => toast.remove(), 400); // fallback in case transitions are disabled
  };

  toast.querySelector('.toast__close').addEventListener('click', close);
  document.getElementById('toast-stack').append(toast);
  setTimeout(close, duration);
}
