/**
 * Thông tin đăng nhập phía client.
 * Server giữ session bằng cookie httpOnly, client chỉ hỏi "tôi là ai?" qua /api/auth/me.
 */
import { api } from './api.js';

let currentUserPromise = null;

/**
 * Lấy user đang đăng nhập (null nếu là khách).
 * Kết quả được nhớ lại trong trang để nhiều module gọi cũng chỉ tốn 1 request.
 */
export function getCurrentUser({ refresh = false } = {}) {
  if (!currentUserPromise || refresh) {
    currentUserPromise = api
      .get('/api/auth/me')
      .then(({ data }) => data)
      .catch((err) => {
        if (err.status === 401 || err.status === 403) return null; // chưa đăng nhập / bị khóa
        currentUserPromise = null; // lỗi mạng -> lần sau thử lại
        throw err;
      });
  }
  return currentUserPromise;
}

/** Đăng nhập, trả về user. Lỗi (sai mật khẩu, bị khóa...) ném ApiError */
export async function login({ email, password }) {
  const { data } = await api.post('/api/auth/login', { email, password });
  currentUserPromise = Promise.resolve(data);
  return data;
}

/** Đăng ký (server tự đăng nhập luôn sau khi tạo tài khoản), trả về user */
export async function register({ name, email, phone, password }) {
  const { data } = await api.post('/api/auth/register', { name, email, phone, password });
  currentUserPromise = Promise.resolve(data);
  return data;
}

export async function logout() {
  await api.post('/api/auth/logout');
  currentUserPromise = Promise.resolve(null);
}

/**
 * Trang cần quay lại sau khi đăng nhập, lấy từ ?redirect=...
 * Chỉ chấp nhận đường dẫn nội bộ ("/sell") để tránh bị lợi dụng chuyển hướng
 * sang trang lừa đảo ("https://...", "//evil.com").
 */
export function getRedirectTarget(fallback = '/') {
  const target = new URLSearchParams(window.location.search).get('redirect') ?? '';
  const isInternal = target.startsWith('/') && !target.startsWith('//') && !target.startsWith('/\\');
  return isInternal ? target : fallback;
}

/** URL trang đăng nhập kèm ?redirect= về trang hiện tại */
export function loginUrl(redirect = window.location.pathname + window.location.search) {
  return `/login?redirect=${encodeURIComponent(redirect)}`;
}
