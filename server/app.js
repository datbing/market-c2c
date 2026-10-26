/**
 * Khởi tạo ứng dụng Express (CHỈ LÀ BACKEND API):
 *  - API JSON tại /api
 *  - Ảnh upload tại /uploads
 * Frontend nằm riêng ở thư mục /frontend, do Apache (Laragon) phục vụ tại
 * http://market-c2c.test và gọi sang API này qua CORS.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import { config } from './config/env.js';
import apiRouter from './routes/index.js';
import { cors } from './middleware/cors.js';
import { apiNotFound, errorHandler } from './middleware/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

export const app = express();
app.disable('x-powered-by');

// CORS đặt đầu tiên để cả /api lẫn /uploads đều có header phù hợp
app.use(cors);

// ---------- Ảnh upload ----------
app.use(
  '/uploads',
  express.static(path.join(ROOT_DIR, 'uploads'), {
    // Cho phép trang khác origin hiển thị ảnh
    setHeaders: (res) => res.set('Cross-Origin-Resource-Policy', 'cross-origin'),
  }),
);

// ---------- API ----------
const sessionMiddleware = session({
  name: config.session.cookieName,
  secret: config.session.secret,
  resave: false,
  saveUninitialized: false, // chỉ tạo session khi đăng nhập
  cookie: {
    httpOnly: true, // JS phía client không đọc được cookie -> hạn chế XSS đánh cắp phiên
    // Lax: cookie vẫn được gửi giữa market-c2c.test và market-c2c.test:3000
    // vì khác cổng nhưng cùng "site" (cùng tên miền)
    sameSite: 'lax',
    secure: 'auto', // tự bật khi chạy HTTPS
    maxAge: config.session.maxAgeMs,
  },
});

app.use(
  '/api',
  express.json({ limit: '1mb' }),
  express.urlencoded({ extended: true }),
  sessionMiddleware,
  apiRouter,
  apiNotFound,
);

// ---------- Trang gốc: giới thiệu ngắn ----------
app.get('/', (req, res) => {
  res.json({
    success: true,
    data: {
      name: 'Market C2C API',
      health: '/api/health',
      frontend: config.corsOrigins[0] ?? null,
    },
  });
});

// ---------- Đường dẫn không tồn tại ----------
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Không tìm thấy đường dẫn' });
});

// ---------- Xử lý lỗi (luôn đặt cuối) ----------
app.use(errorHandler);
