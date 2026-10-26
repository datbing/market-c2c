/**
 * Xử lý lỗi tập trung: mọi lỗi ném ra trong route đều về đây
 * và được trả về cùng một định dạng JSON:
 *   { success: false, message: "...", errors?: { field: "..." } }
 */
import { HttpError } from '../utils/HttpError.js';
import { config } from '../config/env.js';

/** API không tồn tại */
export function apiNotFound(req, res) {
  res.status(404).json({
    success: false,
    message: `Không tìm thấy API: ${req.method} ${req.originalUrl}`,
  });
}

/** Mã lỗi MySQL khi không kết nối được CSDL */
const DB_CONNECTION_ERRORS = new Set([
  'ECONNREFUSED',
  'ER_ACCESS_DENIED_ERROR',
  'ER_BAD_DB_ERROR',
  'PROTOCOL_CONNECTION_LOST',
]);

// Express nhận biết error handler nhờ hàm có đủ 4 tham số
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  // Lỗi chủ động ném từ controller
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      success: false,
      message: err.message,
      ...(err.errors && { errors: err.errors }),
    });
  }

  // Body JSON sai cú pháp
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Dữ liệu JSON gửi lên không đúng định dạng' });
  }

  // Body quá lớn
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Dữ liệu gửi lên quá lớn' });
  }

  // Trùng khóa UNIQUE trong MySQL
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ success: false, message: 'Dữ liệu đã tồn tại' });
  }

  // Mất kết nối CSDL
  if (DB_CONNECTION_ERRORS.has(err.code)) {
    console.error('[DB]', err.code, err.message);
    return res.status(503).json({ success: false, message: 'Không kết nối được cơ sở dữ liệu' });
  }

  // Lỗi không lường trước
  console.error(err);
  return res.status(500).json({
    success: false,
    message: 'Lỗi máy chủ, vui lòng thử lại sau',
    ...(!config.isProd && { detail: err.message }),
  });
}
