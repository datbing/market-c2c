/**
 * Hộp xác nhận dùng thẻ <dialog> của HTML5 (thay cho window.confirm xấu và chặn trang).
 *
 * HTML viết sẵn trong trang:
 *   <dialog id="confirm-dialog">
 *     <form method="dialog">          <- bấm nút trong form này tự đóng dialog
 *       <h2 data-confirm-title></h2> <p data-confirm-message></p>
 *       <button value="cancel">       <- dialog.returnValue = "cancel"
 *       <button value="confirm" data-confirm-ok>
 *     </form>
 *   </dialog>
 *
 * Dùng:  if (await confirmDialog({ title: 'Xóa tin?', danger: true })) { ... }
 */

/**
 * @param {object} options
 * @param {string} options.title
 * @param {string} [options.message]
 * @param {string} [options.confirmText]
 * @param {boolean} [options.danger]  nút đồng ý màu đỏ (thao tác không hoàn tác được)
 * @returns {Promise<boolean>} true nếu người dùng bấm đồng ý
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

  // Esc hoặc nút Hủy -> returnValue khác "confirm"
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
  });
}
