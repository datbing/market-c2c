/**
 * Model for the admin area: statistics, system-wide listing / user lists.
 */
import { query, queryOne } from '../config/db.js';
import { toListingCard } from './listing.model.js';

/** Escape LIKE special characters (% and _) */
const escapeLike = (str) => str.replace(/[\\%_]/g, (ch) => `\\${ch}`);

/** Turn [{ key, total }] into an object containing every key (missing = 0) + an "all" total */
function toCounts(rows, keys, key = 'status') {
  const counts = Object.fromEntries(keys.map((k) => [k, 0]));
  rows.forEach((row) => {
    counts[row[key]] = Number(row.total);
  });
  counts.all = Object.values(counts).reduce((sum, n) => sum + n, 0);
  return counts;
}

/** The last N days as "YYYY-MM-DD" (server time) */
function lastDays(days) {
  const result = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const pad = (n) => String(n).padStart(2, '0');
    result.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }
  return result;
}

// ---------------------------------------------------------
//  Dashboard statistics
// ---------------------------------------------------------

/**
 * Dashboard numbers. The queries are independent -> run them in parallel with Promise.all.
 * @param {number} days  number of days for the daily charts
 */
export async function getStats(days = 14) {
  const series = lastDays(days);
  const from = series[0];

  const [users, listingRows, orderRows, openReports, listingDaily, orderDaily, categories] = await Promise.all([
    queryOne(
      `SELECT COUNT(*) AS total,
              SUM(status = 'locked') AS locked,
              SUM(created_at >= NOW() - INTERVAL 7 DAY) AS new_7d
         FROM users WHERE role = 'user'`,
    ),
    query('SELECT status, COUNT(*) AS total FROM listings GROUP BY status'),
    query('SELECT status, COUNT(*) AS total, COALESCE(SUM(price), 0) AS amount FROM orders GROUP BY status'),
    queryOne("SELECT COUNT(*) AS total FROM reports WHERE status = 'open'"),
    // New listings per day
    query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS day, COUNT(*) AS total
         FROM listings WHERE created_at >= ? GROUP BY day`,
      [from],
    ),
    // New orders + value of completed orders per day
    query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS day,
              COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN status = 'completed' THEN price END), 0) AS revenue
         FROM orders WHERE created_at >= ? GROUP BY day`,
      [from],
    ),
    query(
      `SELECT c.name, c.icon, COUNT(l.id) AS total
         FROM categories c
         LEFT JOIN listings l ON l.category_id = c.id AND l.status = 'active'
        GROUP BY c.id ORDER BY c.sort_order`,
    ),
  ]);

  // Fill in every day (days without data = 0) so the chart has no missing columns
  const byDay = (rows, field) => {
    const map = new Map(rows.map((r) => [r.day, Number(r[field])]));
    return series.map((day) => map.get(day) ?? 0);
  };

  const orderCounts = toCounts(orderRows, ['pending', 'confirmed', 'shipping', 'completed', 'cancelled']);
  const revenue = Number(orderRows.find((r) => r.status === 'completed')?.amount ?? 0);

  return {
    users: { total: Number(users.total), locked: Number(users.locked ?? 0), new7d: Number(users.new_7d ?? 0) },
    listings: toCounts(listingRows, ['pending', 'active', 'sold', 'hidden', 'rejected']),
    orders: orderCounts,
    revenue,
    openReports: Number(openReports.total),
    daily: {
      days: series,
      listings: byDay(listingDaily, 'total'),
      orders: byDay(orderDaily, 'total'),
      revenue: byDay(orderDaily, 'revenue'),
    },
    categories: categories.map((c) => ({ name: c.name, icon: c.icon, total: Number(c.total) })),
  };
}

// ---------------------------------------------------------
//  Listings (system-wide)
// ---------------------------------------------------------
export async function findListings({ status, keywords = [], page = 1, limit = 10 } = {}) {
  const conditions = ['1 = 1'];
  const params = [];
  if (status) {
    conditions.push('l.status = ?');
    params.push(status);
  }
  for (const word of keywords) {
    // Search by title / description (accent-insensitive) or seller name / email
    conditions.push('(l.search_text LIKE ? OR u.name LIKE ? OR u.email LIKE ?)');
    const like = `%${escapeLike(word)}%`;
    params.push(like, like, like);
  }
  const where = conditions.join(' AND ');
  const from = `FROM listings l JOIN categories c ON c.id = l.category_id JOIN users u ON u.id = l.user_id`;

  const [countRow, rows, statusRows] = await Promise.all([
    queryOne(`SELECT COUNT(*) AS total ${from} WHERE ${where}`, params),
    query(
      `SELECT l.id, l.title, l.price, l.item_condition, l.province, l.status, l.reject_reason,
              l.views, l.created_at,
              c.id AS category_id, c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon,
              u.id AS seller_id, u.name AS seller_name, u.email AS seller_email, u.status AS seller_status,
              (SELECT i.path FROM listing_images i
                WHERE i.listing_id = l.id ORDER BY i.sort_order, i.id LIMIT 1) AS thumbnail,
              (SELECT COUNT(*) FROM reports r WHERE r.listing_id = l.id AND r.status = 'open') AS open_reports
         ${from}
        WHERE ${where}
        ORDER BY l.status = 'pending' DESC, l.created_at DESC, l.id DESC
        LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit],
    ),
    query('SELECT status, COUNT(*) AS total FROM listings GROUP BY status'),
  ]);

  return {
    rows,
    total: Number(countRow.total),
    counts: toCounts(statusRows, ['pending', 'active', 'sold', 'hidden', 'rejected']),
  };
}

export function toAdminListing(row) {
  return {
    ...toListingCard(row),
    rejectReason: row.reject_reason,
    openReports: Number(row.open_reports ?? 0),
    seller: { id: row.seller_id, name: row.seller_name, email: row.seller_email, status: row.seller_status },
  };
}

/** Approve / reject / take down a listing. The reason is only stored when rejecting */
export function setListingReview(id, status, reason = null) {
  return query('UPDATE listings SET status = ?, reject_reason = ? WHERE id = ?', [
    status,
    status === 'rejected' ? reason : null,
    id,
  ]);
}

// ---------------------------------------------------------
//  Users
// ---------------------------------------------------------
export async function findUsers({ q, status, page = 1, limit = 10 } = {}) {
  const conditions = ['1 = 1'];
  const params = [];
  if (status) {
    conditions.push('u.status = ?');
    params.push(status);
  }
  if (q) {
    conditions.push('(u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)');
    const like = `%${escapeLike(q)}%`;
    params.push(like, like, like);
  }
  const where = conditions.join(' AND ');

  const [countRow, rows, statusRows] = await Promise.all([
    queryOne(`SELECT COUNT(*) AS total FROM users u WHERE ${where}`, params),
    query(
      `SELECT u.id, u.name, u.email, u.phone, u.province, u.role, u.status, u.last_login_at, u.created_at,
              (SELECT COUNT(*) FROM listings l WHERE l.user_id = u.id) AS listing_count,
              (SELECT COUNT(*) FROM orders o WHERE o.buyer_id = u.id) AS buy_count,
              (SELECT COUNT(*) FROM orders o WHERE o.seller_id = u.id AND o.status = 'completed') AS sold_count
         FROM users u
        WHERE ${where}
        ORDER BY u.role = 'admin' DESC, u.created_at DESC
        LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit],
    ),
    query('SELECT status, COUNT(*) AS total FROM users GROUP BY status'),
  ]);

  return { rows, total: Number(countRow.total), counts: toCounts(statusRows, ['active', 'locked']) };
}

export function toAdminUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    province: row.province,
    role: row.role,
    status: row.status,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    listingCount: Number(row.listing_count),
    buyCount: Number(row.buy_count),
    soldCount: Number(row.sold_count),
  };
}

export function findUserById(id) {
  return queryOne('SELECT id, name, email, role, status FROM users WHERE id = ?', [id]);
}

export function setUserStatus(id, status) {
  return query('UPDATE users SET status = ? WHERE id = ?', [status, id]);
}

/** Take down a violating listing (runs in the same transaction that closes the reports) */
export async function takeDownListing(conn, id, reason) {
  await conn.query("UPDATE listings SET status = 'rejected', reject_reason = ? WHERE id = ?", [reason, id]);
}
