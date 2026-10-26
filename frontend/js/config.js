/**
 * Cấu hình frontend.
 *
 * Frontend (https://market-c2c.test, Apache của Laragon) và backend
 * (https://market-c2c.test:3000, Node/Express) là 2 server riêng.
 * API dùng cùng tên miền với trang, chỉ khác cổng -> trình duyệt coi là
 * "cùng site" nên cookie đăng nhập (SameSite=Lax) vẫn được gửi kèm.
 *
 * Cả 2 đều chạy HTTPS (dùng chung chứng chỉ của Laragon). Trang https bắt buộc
 * gọi API https, nếu không trình duyệt chặn vì "mixed content".
 */
export const API_PORT = 3000;
export const API_BASE = `https://${window.location.hostname}:${API_PORT}`;

/**
 * Đường dẫn file từ backend (vd ảnh "/uploads/abc.jpg") -> URL đầy đủ.
 * URL tuyệt đối (http...) và ảnh xem trước tạm thời (blob:, data:) giữ nguyên.
 */
export function assetUrl(path) {
  if (!path) return null;
  if (/^(https?:\/\/|blob:|data:)/.test(path)) return path;
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}
