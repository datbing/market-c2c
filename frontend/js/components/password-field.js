/**
 * Password field:
 *  - Show/hide button: <button data-toggle-password="input-id" aria-pressed="false">
 *    (the open/closed eye icon is switched by CSS based on aria-pressed)
 *  - Measures password strength, displayed with the HTML5 <meter> element
 */

/** Add behavior to every show/hide password button inside root (event delegation) */
export function initPasswordToggles(root = document) {
  root.addEventListener('click', (e) => {
    const button = e.target.closest('[data-toggle-password]');
    if (!button) return;

    const input = document.getElementById(button.dataset.togglePassword);
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    button.setAttribute('aria-pressed', String(show));
    button.setAttribute('aria-label', show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
    input.focus();
  });
}

const STRENGTH_LABELS = ['Rất yếu', 'Yếu', 'Trung bình', 'Mạnh', 'Rất mạnh'];

/**
 * Score a password 0-4: long enough, upper + lower case, digits, special characters.
 * Under 6 characters (fails the server validation) is always 0.
 */
export function scorePassword(password = '') {
  if (password.length < 6) return 0;
  const checks = [
    password.length >= 10,
    /[a-z]/.test(password) && /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  return checks.filter(Boolean).length;
}

/**
 * Update the <meter> + text label for the password being typed.
 * @param {HTMLInputElement} input
 * @param {HTMLMeterElement} meter
 * @param {HTMLElement} label
 */
export function bindStrengthMeter(input, meter, label) {
  const update = () => {
    const empty = input.value.length === 0;
    const score = scorePassword(input.value);
    meter.value = empty ? 0 : score + 1; // meter 0-5, at least 1 bar once something is typed
    label.textContent = empty ? '' : `Độ mạnh: ${STRENGTH_LABELS[score]}`;
  };
  input.addEventListener('input', update);
  update();
}
