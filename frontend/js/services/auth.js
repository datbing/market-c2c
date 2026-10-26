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

export async function logout() {
  await api.post('/api/auth/logout');
  currentUserPromise = Promise.resolve(null);
}
