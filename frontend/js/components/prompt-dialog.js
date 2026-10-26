/**
 * Reason prompt built on <dialog> (replaces window.prompt): rejecting listings, taking down violations...
 *
 * HTML written in the page:
 *   <dialog id="prompt-dialog">
 *     <form method="dialog">
 *       <h2 data-prompt-title></h2> <p data-prompt-message></p>
 *       <div data-prompt-suggestions></div>          (suggested reason buttons, from <template id="tpl-suggestion">)
 *       <textarea name="reason" data-prompt-input></textarea>
 *       <p data-prompt-error hidden></p>
 *       <button value="cancel">  <button value="confirm" data-prompt-ok>
 *     </form>
 *   </dialog>
 *
 * Usage:  const reason = await promptDialog({ title: 'Từ chối tin', required: true });
 *         if (reason === null) return; // Cancel was pressed
 */
import { cloneTemplate } from '../utils/template.js';

/**
 * @param {object} options
 * @param {string} options.title
 * @param {string} [options.message]
 * @param {string} [options.placeholder]
 * @param {boolean} [options.required]     input is required
 * @param {string[]} [options.suggestions] suggested reasons, click to fill in
 * @param {string} [options.confirmText]
 * @param {boolean} [options.danger]
 * @returns {Promise<string|null>} entered text ('' when optional and left empty), null when cancelled
 */
export function promptDialog({
  title,
  message = '',
  placeholder = '',
  required = false,
  suggestions = [],
  confirmText = 'Xác nhận',
  danger = false,
}) {
  const dialog = document.getElementById('prompt-dialog');
  const input = dialog.querySelector('[data-prompt-input]');
  const error = dialog.querySelector('[data-prompt-error]');
  const ok = dialog.querySelector('[data-prompt-ok]');
  const list = dialog.querySelector('[data-prompt-suggestions]');

  dialog.querySelector('[data-prompt-title]').textContent = title;
  dialog.querySelector('[data-prompt-message]').textContent = message;
  input.value = '';
  input.placeholder = placeholder;
  error.hidden = true;
  ok.textContent = confirmText;
  ok.classList.toggle('btn--danger', danger);
  ok.classList.toggle('btn--primary', !danger);

  list.replaceChildren(
    ...suggestions.map((text) => {
      const btn = cloneTemplate('tpl-suggestion');
      btn.textContent = text;
      return btn;
    }),
  );
  list.hidden = suggestions.length === 0;

  return new Promise((resolve) => {
    // Click a suggested reason -> fill it into the input
    const onSuggest = (e) => {
      const btn = e.target.closest('[data-suggestion]');
      if (!btn) return;
      input.value = btn.textContent;
      input.focus();
    };

    // Required but empty -> keep the dialog open and show an error
    const onOk = (e) => {
      if (required && !input.value.trim()) {
        e.preventDefault();
        error.hidden = false;
        input.focus();
      }
    };

    const onClose = () => {
      list.removeEventListener('click', onSuggest);
      ok.removeEventListener('click', onOk);
      resolve(dialog.returnValue === 'confirm' ? input.value.trim() : null);
    };

    list.addEventListener('click', onSuggest);
    ok.addEventListener('click', onOk);
    dialog.addEventListener('close', onClose, { once: true });

    dialog.returnValue = '';
    dialog.showModal();
    input.focus();
  });
}
