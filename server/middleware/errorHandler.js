/**
 * Central error handling: every error thrown in a route ends up here
 * and is returned in the same JSON format:
 *   { success: false, message: "...", errors?: { field: "..." } }
 */
import { HttpError } from '../utils/HttpError.js';
import { config } from '../config/env.js';

/** Unknown API */
export function apiNotFound(req, res) {
  res.status(404).json({
    success: false,
    message: `Không tìm thấy API: ${req.method} ${req.originalUrl}`,
  });
}

/** MySQL error codes when the database cannot be reached */
const DB_CONNECTION_ERRORS = new Set([
  'ECONNREFUSED',
  'ER_ACCESS_DENIED_ERROR',
  'ER_BAD_DB_ERROR',
  'PROTOCOL_CONNECTION_LOST',
]);

// Express recognizes an error handler by its 4 parameters
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  // Errors thrown deliberately by controllers
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      success: false,
      message: err.message,
      ...(err.errors && { errors: err.errors }),
    });
  }

  // Malformed JSON body
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Dữ liệu JSON gửi lên không đúng định dạng' });
  }

  // Body too large
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Dữ liệu gửi lên quá lớn' });
  }

  // UNIQUE key violation in MySQL
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ success: false, message: 'Dữ liệu đã tồn tại' });
  }

  // Lost database connection
  if (DB_CONNECTION_ERRORS.has(err.code)) {
    console.error('[DB]', err.code, err.message);
    return res.status(503).json({ success: false, message: 'Không kết nối được cơ sở dữ liệu' });
  }

  // Unexpected error
  console.error(err);
  return res.status(500).json({
    success: false,
    message: 'Lỗi máy chủ, vui lòng thử lại sau',
    ...(!config.isProd && { detail: err.message }),
  });
}
