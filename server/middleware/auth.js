/**
 * Session-based authentication middleware.
 * On login the server stores `req.session.userId`; the browser keeps the `mc2c.sid` cookie.
 */
import { HttpError } from '../utils/HttpError.js';
import { destroySession } from '../utils/session.js';
import * as User from '../models/user.model.js';

/**
 * Login required. Attaches the current user to `req.user`.
 * Always reloads the user from the DB so an admin locking the account takes effect immediately.
 * (Express 5 forwards errors from async functions to errorHandler, no try/catch needed.)
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
 * Optional login: attach req.user if there is a session, otherwise continue.
 * Used by public APIs whose output depends on who is viewing.
 */
export async function optionalAuth(req, res, next) {
  const userId = req.session?.userId;
  if (userId) {
    const user = await User.findById(userId);
    if (user && user.status === 'active') req.user = user;
  }
  next();
}

/** Only lets admins through. Must come AFTER requireAuth. */
export function requireAdmin(req, res, next) {
  if (!req.user) throw HttpError.unauthorized();
  if (req.user.role !== 'admin') throw HttpError.forbidden('Chỉ quản trị viên mới được truy cập');
  next();
}
