/**
 * Tạo database + toàn bộ bảng từ database/schema.sql.
 *   npm run db:setup          -> tạo nếu chưa có (không xóa dữ liệu cũ)
 *   npm run db:reset          -> XÓA database, tạo lại và seed dữ liệu mẫu
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from '../server/config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(__dirname, '../database/schema.sql');
const isReset = process.argv.includes('--reset');

const { database, ...connectionOptions } = config.db;

// Tên database được ghép trực tiếp vào SQL nên phải kiểm tra an toàn
if (!/^[A-Za-z0-9_]+$/.test(database)) {
  console.error('✖ DB_NAME chỉ được chứa chữ, số và dấu gạch dưới');
  process.exit(1);
}

let connection;
try {
  // Kết nối chưa chọn database vì có thể database chưa tồn tại
  connection = await mysql.createConnection({
    ...connectionOptions,
    charset: 'utf8mb4',
    multipleStatements: true, // cho phép chạy cả file schema.sql một lần
  });

  if (isReset) {
    await connection.query(`DROP DATABASE IF EXISTS \`${database}\``);
    console.log(`⚠ Đã xóa database "${database}"`);
  }

  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${database}\`
       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await connection.query(`USE \`${database}\``);

  const schemaSql = await fs.readFile(SCHEMA_PATH, 'utf8');
  await connection.query(schemaSql);

  const [tables] = await connection.query('SHOW TABLES');
  console.log(`✔ Database "${database}" sẵn sàng với ${tables.length} bảng:`);
  tables.forEach((row) => console.log('   -', Object.values(row)[0]));
} catch (err) {
  console.error(`✖ Lỗi khi tạo database: ${err.message}`);
  console.error('  → Kiểm tra MySQL đã chạy và thông tin trong file .env');
  process.exitCode = 1;
} finally {
  await connection?.end();
}
