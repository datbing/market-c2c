/**
 * MySQL connection pool (mysql2/promise).
 * The pool keeps several connections open and reuses them across requests -> faster than opening/closing each time.
 */
import mysql from 'mysql2/promise';
import { config } from './env.js';

export const pool = mysql.createPool({
  ...config.db,
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true, // return DECIMAL as number instead of string
});

/**
 * Run a SQL statement with parameters (placeholder `?`) -> mysql2 escapes them, preventing SQL injection.
 * @returns {Promise<any>} rows (SELECT) or a ResultSetHeader (INSERT/UPDATE/DELETE)
 */
export async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/** Fetch exactly one row, null if none */
export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}

/**
 * Run several SQL statements in one transaction.
 * If the callback throws -> roll everything back, otherwise -> commit.
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

/** Check the DB connection (used at server startup and by /api/health) */
export async function checkConnection() {
  await pool.query('SELECT 1');
}
