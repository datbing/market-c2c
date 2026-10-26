/**
 * TRANG ĐĂNG NHẬP
 *  - Validate phía trình duyệt (cùng quy tắc với server) + hiện lỗi server
 *  - "Ghi nhớ email": lưu email vào LocalStorage, lần sau điền sẵn
 *  - Thành công: để lại thông báo flash (SessionStorage) rồi quay về trang trước (?redirect=)
 */
import { $ } from '../utils/dom.js';
import { rules } from '../utils/validators.js';
import { local } from '../services/storage.js';
import { login, getRedirectTarget } from '../services/auth.js';
import { setFlash } from '../services/flash.js';
import { initHeader } from '../components/header.js';
import { FormHandler } from '../components/form.js';
import { initPasswordToggles } from '../components/password-field.js';
import { redirectIfLoggedIn, keepRedirectOnLinks } from '../components/auth-page.js';

const REMEMBER_KEY = 'rememberEmail';

async function main() {
  // Đã đăng nhập -> chuyển trang luôn, không khởi tạo gì thêm
  if (await redirectIfLoggedIn()) return;

  initHeader();
  keepRedirectOnLinks();
  initPasswordToggles($('#login-form'));

  // Điền sẵn email đã ghi nhớ
  const rememberedEmail = local.get(REMEMBER_KEY);
  if (rememberedEmail) {
    $('#login-email').value = rememberedEmail;
    $('#login-remember').checked = true;
    $('#login-password').focus();
  }

  const form = new FormHandler($('#login-form'), {
    schema: {
      email: [rules.required('Vui lòng nhập email'), rules.email()],
      password: [rules.required('Vui lòng nhập mật khẩu')],
    },

    async onSubmit({ email, password, remember }) {
      try {
        const user = await login({ email, password });

        if (remember) local.set(REMEMBER_KEY, email);
        else local.remove(REMEMBER_KEY);

        setFlash(`Xin chào ${user.name}, bạn đã đăng nhập thành công`, 'success');
        window.location.assign(getRedirectTarget());
      } catch (err) {
        // Sai mật khẩu: xóa ô mật khẩu cho người dùng gõ lại
        if (err.status === 401) {
          const password = $('#login-password');
          password.value = '';
          password.focus();
        }
        throw err; // FormHandler hiện thông báo lỗi
      }
    },
  });

  // Thông báo khi bị chuyển tới đây vì trang trước yêu cầu đăng nhập
  if (new URLSearchParams(window.location.search).has('redirect')) {
    form.showAlert('Vui lòng đăng nhập để tiếp tục', 'info');
  }
}

main();
