/**
 * User model: holds every SQL statement for the `users` table.
 * Controllers never write SQL directly, they call the functions here.
 */
import { query, queryOne } from '../config/db.js';

/** Columns safe to return to the client (no password_hash) */
const PUBLIC_COLUMNS = `id, name, email, phone, avatar, province, role, status,
  last_login_at, created_at`;

/** Convert a DB row (snake_case) into a JSON object (camelCase) for the frontend */
export function toPublicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    avatar: row.avatar,
    province: row.province,
    role: row.role,
    status: row.status,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };
}

export function findById(id) {
  return queryOne(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`, [id]);
}

/** Also loads password_hash -> only used internally for login */
export function findByEmailWithPassword(email) {
  return queryOne('SELECT * FROM users WHERE email = ?', [email]);
}

export async function emailExists(email) {
  const row = await queryOne('SELECT id FROM users WHERE email = ?', [email]);
  return Boolean(row);
}

export async function createUser({ name, email, phone = null, passwordHash }) {
  const result = await query(
    'INSERT INTO users (name, email, phone, password_hash) VALUES (?, ?, ?, ?)',
    [name, email, phone, passwordHash],
  );
  return findById(result.insertId);
}

export function touchLastLogin(id) {
  return query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [id]);
}
