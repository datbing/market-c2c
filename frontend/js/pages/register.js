/**
 * TRANG ĐĂNG KÝ
 *  - Quy tắc validate giống server (server/controllers/auth.controller.js)
 *  - Nhập lại mật khẩu, đo độ mạnh mật khẩu (<meter>), đồng ý điều khoản
 *  - Email đã tồn tại (409) -> lỗi hiện ngay dưới ô email
 *  - Server tự đăng nhập sau khi đăng ký -> chuyển về trang trước (?redirect=)
 */
import { $ } from '../utils/dom.js';
import { rules } from '../utils/validators.js';
import { register, getRedirectTarget } from '../services/auth.js';
import { setFlash } from '../services/flash.js';
import { initHeader } from '../components/header.js';
import { FormHandler } from '../components/form.js';
import { initPasswordToggles, bindStrengthMeter } from '../components/password-field.js';
import { redirectIfLoggedIn, keepRedirectOnLinks } from '../components/auth-page.js';

const PHONE_RE = /^0\d{9}$/; // 10 số, bắt đầu bằng 0 (giống server)

async function main() {
  // Đã đăng nhập -> chuyển trang luôn, không khởi tạo gì thêm
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
