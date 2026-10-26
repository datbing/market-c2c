/**
 * Phần dùng chung của trang đăng nhập và đăng ký.
 */
import { $$ } from '../utils/dom.js';
import { getCurrentUser, getRedirectTarget } from '../services/auth.js';

/**
 * Đã đăng nhập rồi thì không cần ở trang này nữa -> chuyển đi luôn.
 * Gọi TRƯỚC initHeader() để header không hiện (và xóa mất) thông báo flash
 * của một trang sắp bị rời đi.
 * @returns {Promise<boolean>} true nếu đang chuyển trang
 */
export async function redirectIfLoggedIn() {
  try {
    const user = await getCurrentUser();
    if (user) {
      window.location.replace(getRedirectTarget());
      return true;
    }
  } catch {
    /* lỗi mạng: cứ để người dùng thấy form */
  }
  return false;
}

/**
 * Giữ nguyên ?redirect= khi chuyển qua lại giữa trang đăng nhập và đăng ký.
 * Áp dụng cho các link có thuộc tính data-keep-redirect.
 */
export function keepRedirectOnLinks() {
  const redirect = new URLSearchParams(window.location.search).get('redirect');
  if (!redirect) return;
  $$('a[data-keep-redirect]').forEach((link) => {
    const url = new URL(link.href);
    url.searchParams.set('redirect', redirect);
    link.href = url.pathname + url.search;
  });
}
