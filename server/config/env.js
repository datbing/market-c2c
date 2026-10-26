/**
 * Đọc biến môi trường từ file .env và gom vào một object cấu hình duy nhất.
 * Các file khác chỉ import `config` thay vì đọc process.env trực tiếp.
 */
import 'dotenv/config';

/** Chuyển chuỗi sang số nguyên, trả về giá trị mặc định nếu không hợp lệ */
const toInt = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
};

export const config = Object.freeze({
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: toInt(process.env.PORT, 3000),

  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: toInt(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME || 'market_c2c',
  },

  /**
   * Origin của frontend được phép gọi API kèm cookie (CORS).
   * Nhiều origin cách nhau bằng dấu phẩy, vd: "http://market-c2c.test,http://localhost:5500"
   */
  corsOrigins: (process.env.CORS_ORIGINS || 'http://market-c2c.test')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean),

  session: {
    cookieName: 'mc2c.sid',
    secret: process.env.SESSION_SECRET || 'market-c2c-dev-secret',
    maxAgeMs: toInt(process.env.SESSION_MAX_AGE_HOURS, 24) * 60 * 60 * 1000,
  },
});
