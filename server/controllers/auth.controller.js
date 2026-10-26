/**
 * Controller xác thực: đăng ký, đăng nhập, đăng xuất, lấy thông tin tài khoản.
 */
import bcrypt from 'bcryptjs';
import { config } from '../config/env.js';
import { HttpError } from '../utils/HttpError.js';
import { validate, rules } from '../utils/validate.js';
import { regenerateSession, saveSession, destroySession } from '../utils/session.js';
import * as User from '../models/user.model.js';

const PHONE_RE = /^0\d{9}$/; // 10 số, bắt đầu bằng 0
const SALT_ROUNDS = 10;

/** Tạo session mới cho user sau khi đăng ký/đăng nhập thành công */
async function startSession(req, userId) {
  await regenerateSession(req);
  req.session.userId = userId;
  await saveSession(req);
}

/** POST /api/auth/register */
export async function register(req, res) {
  const body = req.body ?? {};

  validate(body, {
    name: [rules.required('Vui lòng nhập họ tên'), rules.minLength(2), rules.maxLength(100)],
    email: [rules.required('Vui lòng nhập email'), rules.email(), rules.maxLength(150)],
    phone: [rules.pattern(PHONE_RE, 'Số điện thoại gồm 10 số và bắt đầu bằng 0')],
    password: [
      rules.required('Vui lòng nhập mật khẩu'),
      rules.minLength(6, 'Mật khẩu tối thiểu 6 ký tự'),
      rules.maxLength(72, 'Mật khẩu tối đa 72 ký tự'),
    ],
  });

  const email = String(body.email).trim().toLowerCase();

  if (await User.emailExists(email)) {
    throw HttpError.conflict('Email đã được sử dụng', { email: 'Email đã được sử dụng' });
  }

  // Không bao giờ lưu mật khẩu gốc, chỉ lưu chuỗi băm bcrypt
  const passwordHash = await bcrypt.hash(String(body.password), SALT_ROUNDS);

  const user = await User.createUser({
    name: String(body.name).trim(),
    email,
    phone: body.phone ? String(body.phone).trim() : null,
    passwordHash,
  });

  await startSession(req, user.id);

  res.status(201).json({
    success: true,
    message: 'Đăng ký thành công',
    data: User.toPublicUser(user),
  });
}

/** POST /api/auth/login */
export async function login(req, res) {
  const body = req.body ?? {};

  validate(body, {
    email: [rules.required('Vui lòng nhập email'), rules.email()],
    password: [rules.required('Vui lòng nhập mật khẩu')],
  });

  const email = String(body.email).trim().toLowerCase();
  const user = await User.findByEmailWithPassword(email);

  // Báo chung một thông báo để không lộ email nào đã tồn tại
  const isMatch = user && (await bcrypt.compare(String(body.password), user.password_hash));
  if (!isMatch) throw HttpError.unauthorized('Email hoặc mật khẩu không đúng');

  if (user.status === 'locked') {
    throw HttpError.forbidden('Tài khoản của bạn đã bị khóa, vui lòng liên hệ quản trị viên');
  }

  await User.touchLastLogin(user.id);
  await startSession(req, user.id);

  res.json({
    success: true,
    message: 'Đăng nhập thành công',
    data: User.toPublicUser(await User.findById(user.id)),
  });
}

/** POST /api/auth/logout */
export async function logout(req, res) {
  await destroySession(req);
  res.clearCookie(config.session.cookieName);
  res.json({ success: true, message: 'Đã đăng xuất' });
}

/** GET /api/auth/me (cần đăng nhập) */
export function me(req, res) {
  res.json({ success: true, data: User.toPublicUser(req.user) });
}
