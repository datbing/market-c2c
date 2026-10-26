/**
 * Cấu hình frontend.
 *
 * Frontend (http://market-c2c.test, Apache của Laragon) và backend
 * (http://market-c2c.test:3000, Node/Express) là 2 server riêng.
 * API dùng cùng tên miền với trang, chỉ khác cổng -> trình duyệt coi là
 * "cùng site" nên cookie đăng nhập (SameSite=Lax) vẫn được gửi kèm.
 *
 * Lưu ý: mở trang bằng http:// (không phải https://), vì trang https
 * không được gọi API http (mixed content).
 */
export const API_PORT = 3000;
export const API_BASE = `http://${window.location.hostname}:${API_PORT}`;

/**
 * Đường dẫn file từ backend (vd ảnh "/uploads/abc.jpg") -> URL đầy đủ.
 * URL tuyệt đối (http...) giữ nguyên.
 */
export function assetUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}
