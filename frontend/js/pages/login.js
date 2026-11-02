/**
 * LOGIN PAGE
 *  - Browser-side validation (same rules as the server) + server errors
 *  - "Remember email": saves the email in LocalStorage and prefills it next time
 *  - Success: leaves a flash message (SessionStorage) and goes back to the previous page (?redirect=)
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
  // Already logged in -> redirect right away, nothing else to initialize
  if (await redirectIfLoggedIn()) return;

  initHeader();
  keepRedirectOnLinks();
  initPasswordToggles($('#login-form'));

  // Prefill the remembered email
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
        // Wrong password: clear the password field so the user can retype it
        if (err.status === 401) {
          const password = $('#login-password');
          password.value = '';
          password.focus();
        }
        throw err; // FormHandler shows the error
      }
    },
  });

  // Message shown when redirected here because the previous page requires login
  if (new URLSearchParams(window.location.search).has('redirect')) {
    form.showAlert('Vui lòng đăng nhập để tiếp tục', 'info');
  }
}

main();
