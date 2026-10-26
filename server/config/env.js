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
   * Nhiều origin cách nhau bằng dấu phẩy, vd: "https://market-c2c.test,https://localhost:5500"
   */
  corsOrigins: (process.env.CORS_ORIGINS || 'https://market-c2c.test')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean),

  /**
   * Chứng chỉ HTTPS cho API. Mặc định dùng chung chứng chỉ Laragon tự tạo
   * (đã có tên miền *.test và được Windows tin cậy khi bật SSL trong Laragon).
   */
  ssl: {
    certFile: process.env.SSL_CERT || 'D:/laragon/etc/ssl/laragon.crt',
    keyFile: process.env.SSL_KEY || 'D:/laragon/etc/ssl/laragon.key',
  },

  session: {
    cookieName: 'mc2c.sid',
    secret: process.env.SESSION_SECRET || 'market-c2c-dev-secret',
    maxAgeMs: toInt(process.env.SESSION_MAX_AGE_HOURS, 24) * 60 * 60 * 1000,
  },
});
