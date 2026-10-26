/**
 * Kết nối MySQL bằng connection pool (mysql2/promise).
 * Pool giữ sẵn nhiều kết nối, tái sử dụng cho các request -> nhanh hơn mở/đóng liên tục.
 */
import mysql from 'mysql2/promise';
import { config } from './env.js';

export const pool = mysql.createPool({
  ...config.db,
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true, // DECIMAL trả về kiểu number thay vì string
});

/**
 * Chạy câu SQL với tham số (placeholder `?`) -> mysql2 tự escape, chống SQL injection.
 * @returns {Promise<any>} mảng dòng (SELECT) hoặc ResultSetHeader (INSERT/UPDATE/DELETE)
 */
export async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/** Lấy đúng 1 dòng, không có thì trả về null */
export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}

/**
 * Chạy nhiều câu SQL trong một transaction.
 * Nếu callback ném lỗi -> rollback toàn bộ, ngược lại -> commit.
 * @param {(conn: import('mysql2/promise').PoolConnection) => Promise<any>} callback
 */
export async function withTransaction(callback) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Kiểm tra kết nối DB (dùng khi khởi động server và cho /api/health) */
export async function checkConnection() {
  await pool.query('SELECT 1');
}
