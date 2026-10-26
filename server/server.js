/**
 * Điểm khởi động server.
 *  1. Kiểm tra kết nối MySQL, lỗi thì báo rõ cách khắc phục rồi thoát.
 *  2. Đọc chứng chỉ SSL và chạy API bằng HTTPS (frontend chạy https nên API
 *     cũng phải https, nếu không trình duyệt chặn vì "mixed content").
 */
import fs from 'node:fs';
import https from 'node:https';
import { app } from './app.js';
import { config } from './config/env.js';
import { pool, checkConnection } from './config/db.js';

/** Đọc file chứng chỉ + khóa, thiếu file thì báo hướng dẫn rồi thoát */
function loadSslOptions() {
  const { certFile, keyFile } = config.ssl;
  try {
    return { cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile) };
  } catch (err) {
    console.error(`✖ Không đọc được chứng chỉ SSL: ${err.message}`);
    console.error('  → Laragon: Menu > Apache > SSL > Enabled để Laragon tạo chứng chỉ');
    console.error(`  → Hoặc khai báo đường dẫn khác bằng SSL_CERT / SSL_KEY trong .env`);
    console.error(`    (đang dùng: ${certFile} | ${keyFile})`);
    process.exit(1);
  }
}

async function bootstrap() {
  try {
    await checkConnection();
    console.log(`Connected to MySQL (database: ${config.db.database})`);
  } catch (err) {
    console.error(`Cannot connect to MySQL: ${err.message}`);
    console.error('Check MySQL already running?');
    console.error('Check .env config: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_DATABASE');
    console.error('`npm run db:setup` ?');
    process.exit(1);
  }

  const server = https.createServer(loadSslOptions(), app);
  server.listen(config.port, () => {
    console.log(`API running at https://market-c2c.test:${config.port}`);
    console.log(`Frontend CORS accepted: ${config.corsOrigins.join(', ')}`);
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
