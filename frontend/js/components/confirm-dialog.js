/**
 * Confirm dialog using the HTML5 <dialog> element (instead of the ugly, page-blocking window.confirm).
 *
 * HTML written in the page:
 *   <dialog id="confirm-dialog">
 *     <form method="dialog">          <- buttons inside this form close the dialog automatically
 *       <h2 data-confirm-title></h2> <p data-confirm-message></p>
 *       <button value="cancel">       <- dialog.returnValue = "cancel"
 *       <button value="confirm" data-confirm-ok>
 *     </form>
 *   </dialog>
 *
 * Usage:  if (await confirmDialog({ title: 'Xóa tin?', danger: true })) { ... }
 */

/**
 * @param {object} options
 * @param {string} options.title
 * @param {string} [options.message]
 * @param {string} [options.confirmText]
 * @param {boolean} [options.danger]  red confirm button (irreversible action)
 * @returns {Promise<boolean>} true if the user confirmed
 */
export function confirmDialog({ title, message = '', confirmText = 'Đồng ý', danger = false }) {
  const dialog = document.getElementById('confirm-dialog');
  dialog.querySelector('[data-confirm-title]').textContent = title;
  dialog.querySelector('[data-confirm-message]').textContent = message;

  const ok = dialog.querySelector('[data-confirm-ok]');
  ok.textContent = confirmText;
  ok.classList.toggle('btn--danger', danger);
  ok.classList.toggle('btn--primary', !danger);

  dialog.returnValue = '';
  dialog.showModal();
  ok.focus();

  // Esc or the Cancel button -> returnValue is not "confirm"
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
  });
}
