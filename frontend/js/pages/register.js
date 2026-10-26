/**
 * REGISTER PAGE
 *  - Same validation rules as the server (server/controllers/auth.controller.js)
 *  - Password confirmation, password strength meter (<meter>), terms agreement
 *  - Email already taken (409) -> error shown right under the email field
 *  - The server logs in automatically after registering -> go back to the previous page (?redirect=)
 */
import { $ } from '../utils/dom.js';
import { rules } from '../utils/validators.js';
import { register, getRedirectTarget } from '../services/auth.js';
import { setFlash } from '../services/flash.js';
import { initHeader } from '../components/header.js';
import { FormHandler } from '../components/form.js';
import { initPasswordToggles, bindStrengthMeter } from '../components/password-field.js';
import { redirectIfLoggedIn, keepRedirectOnLinks } from '../components/auth-page.js';

const PHONE_RE = /^0\d{9}$/; // 10 digits starting with 0 (same as the server)

async function main() {
  // Already logged in -> redirect right away, nothing else to initialize
  if (await redirectIfLoggedIn()) return;

  initHeader();
  keepRedirectOnLinks();
  initPasswordToggles($('#register-form'));
  bindStrengthMeter($('#register-password'), $('#password-strength'), $('#password-strength-label'));

  new FormHandler($('#register-form'), {
    schema: {
      name: [rules.required('Vui lòng nhập họ tên'), rules.minLength(2), rules.maxLength(100)],
      email: [rules.required('Vui lòng nhập email'), rules.email(), rules.maxLength(150)],
      phone: [rules.pattern(PHONE_RE, 'Số điện thoại gồm 10 số và bắt đầu bằng 0')],
      password: [
        rules.required('Vui lòng nhập mật khẩu'),
        rules.minLength(6, 'Mật khẩu tối thiểu 6 ký tự'),
        rules.maxLength(72, 'Mật khẩu tối đa 72 ký tự'),
      ],
      confirmPassword: [
        rules.required('Vui lòng nhập lại mật khẩu'),
        rules.matches('password', 'Mật khẩu nhập lại không khớp'),
      ],
      agree: [rules.checked('Bạn cần đồng ý với điều khoản sử dụng')],
    },

    async onSubmit({ name, email, phone, password }) {
      const user = await register({ name, email, phone: phone || undefined, password });
      setFlash(`Chào mừng ${user.name}! Tài khoản của bạn đã được tạo`, 'success');
      window.location.assign(getRedirectTarget());
    },
  });
}

main();
