/**
 * Điểm khởi động server.
 * Kiểm tra kết nối MySQL trước, lỗi thì báo rõ cách khắc phục rồi thoát.
 */
import { app } from './app.js';
import { config } from './config/env.js';
import { pool, checkConnection } from './config/db.js';

async function bootstrap() {
  try {
    await checkConnection();
    console.log(`✔ Đã kết nối MySQL (database: ${config.db.database})`);
  } catch (err) {
    console.error(`✖ Không kết nối được MySQL: ${err.message}`);
    console.error('  → Kiểm tra: MySQL trong Laragon đã Start chưa?');
    console.error('  → File .env đã đúng DB_USER / DB_PASSWORD chưa?');
    console.error('  → Đã chạy "npm run db:setup" để tạo database chưa?');
    process.exit(1);
  }

  const server = app.listen(config.port, () => {
    console.log(`🚀 API đang chạy tại http://market-c2c.test:${config.port} (hoặc http://localhost:${config.port})`);
    console.log(`   Frontend được phép gọi API: ${config.corsOrigins.join(', ')}`);
  });

  // Tắt server gọn gàng khi nhấn Ctrl + C
  const shutdown = async () => {
    server.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap();
