/**
 * Thông báo "flash": lưu tạm vào SessionStorage trước khi chuyển trang,
 * trang mới đọc ra hiển thị (toast) rồi xóa ngay -> chỉ hiện đúng 1 lần.
 *   setFlash('Đăng nhập thành công', 'success'); location.href = '/';
 */
import { session } from './storage.js';

const KEY = 'flash';

export function setFlash(message, type = 'info') {
  session.set(KEY, { message, type });
}

/** Lấy và xóa thông báo đang chờ (null nếu không có) */
export function consumeFlash() {
  const flash = session.get(KEY);
  session.remove(KEY);
  return flash?.message ? flash : null;
}
