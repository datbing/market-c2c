/**
 * Ô mật khẩu:
 *  - Nút ẩn/hiện: <button data-toggle-password="id-ô-nhập" aria-pressed="false">
 *    (icon mắt mở/đóng do CSS đổi theo aria-pressed)
 *  - Đo độ mạnh mật khẩu, hiển thị bằng thẻ <meter> của HTML5
 */

/** Gắn hành vi cho mọi nút ẩn/hiện mật khẩu trong root (event delegation) */
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
 * Chấm điểm mật khẩu 0–4: đủ dài, chữ hoa + thường, có số, có ký tự đặc biệt.
 * Dưới 6 ký tự (không qua được validate của server) luôn là 0.
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
 * Cập nhật <meter> + nhãn chữ theo mật khẩu đang gõ.
 * @param {HTMLInputElement} input
 * @param {HTMLMeterElement} meter
 * @param {HTMLElement} label
 */
export function bindStrengthMeter(input, meter, label) {
  const update = () => {
    const empty = input.value.length === 0;
    const score = scorePassword(input.value);
    meter.value = empty ? 0 : score + 1; // meter 0–5, có chữ thì tối thiểu 1 vạch
    label.textContent = empty ? '' : `Độ mạnh: ${STRENGTH_LABELS[score]}`;
  };
  input.addEventListener('input', update);
  update();
}
