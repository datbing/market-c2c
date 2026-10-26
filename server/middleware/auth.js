/**
 * Middleware xác thực dựa trên session.
 * Khi đăng nhập, server lưu `req.session.userId`; trình duyệt giữ cookie `mc2c.sid`.
 */
import { HttpError } from '../utils/HttpError.js';
import { destroySession } from '../utils/session.js';
import * as User from '../models/user.model.js';

/**
 * Bắt buộc đăng nhập. Gắn user hiện tại vào `req.user`.
 * Luôn đọc lại user từ DB để nếu admin khóa tài khoản thì có hiệu lực ngay.
 * (Express 5 tự chuyển lỗi của hàm async sang errorHandler, không cần try/catch.)
 */
export async function requireAuth(req, res, next) {
  const userId = req.session?.userId;
  if (!userId) throw HttpError.unauthorized();

  const user = await User.findById(userId);

  if (!user) {
    await destroySession(req);
    throw HttpError.unauthorized('Phiên đăng nhập không còn hợp lệ');
  }

  if (user.status === 'locked') {
    await destroySession(req);
    throw HttpError.forbidden('Tài khoản của bạn đã bị khóa');
  }

  req.user = user;
  next();
}

/**
 * Không bắt buộc đăng nhập: có session thì gắn req.user, không có thì bỏ qua.
 * Dùng cho các API công khai nhưng hiển thị khác nhau tùy người xem.
 */
export async function optionalAuth(req, res, next) {
  const userId = req.session?.userId;
  if (userId) {
    const user = await User.findById(userId);
    if (user && user.status === 'active') req.user = user;
  }
  next();
}

/** Chỉ cho admin đi qua. Phải đặt SAU requireAuth. */
export function requireAdmin(req, res, next) {
  if (!req.user) throw HttpError.unauthorized();
  if (req.user.role !== 'admin') throw HttpError.forbidden('Chỉ quản trị viên mới được truy cập');
  next();
}
