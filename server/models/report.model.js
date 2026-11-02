/**
 * Report model: `reports` table - users report listings, admins handle them.
 *   open      : pending
 *   resolved  : handled (may include taking the listing down)
 *   dismissed : ignored (invalid report)
 */
import { query, queryOne } from '../config/db.js';
import { toImageUrl } from './listing.model.js';

export const REPORT_STATUSES = ['open', 'resolved', 'dismissed'];

export function toReport(row) {
  return {
    id: row.id,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    listing: {
      id: row.listing_id,
      title: row.listing_title,
      status: row.listing_status,
      thumbnail: toImageUrl(row.thumbnail),
      seller: { id: row.seller_id, name: row.seller_name },
    },
    reporter: { id: row.reporter_id, name: row.reporter_name, email: row.reporter_email },
  };
}

/** Whether this user already has an open report for this listing (prevents duplicates) */
export async function hasOpenReport(listingId, reporterId) {
  const row = await queryOne(
    "SELECT id FROM reports WHERE listing_id = ? AND reporter_id = ? AND status = 'open'",
    [listingId, reporterId],
  );
  return Boolean(row);
}

export async function create({ listingId, reporterId, reason }) {
  const result = await query('INSERT INTO reports (listing_id, reporter_id, reason) VALUES (?, ?, ?)', [
    listingId,
    reporterId,
    reason,
  ]);
  return result.insertId;
}

const SELECT_REPORT = `
  SELECT r.*,
         l.title AS listing_title, l.status AS listing_status, l.user_id AS seller_id,
         (SELECT i.path FROM listing_images i
           WHERE i.listing_id = l.id ORDER BY i.sort_order, i.id LIMIT 1) AS thumbnail,
         s.name AS seller_name,
         u.name AS reporter_name, u.email AS reporter_email
    FROM reports r
    JOIN listings l ON l.id = r.listing_id
    JOIN users s    ON s.id = l.user_id
    JOIN users u    ON u.id = r.reporter_id`;

export async function findAll({ status, page = 1, limit = 10 } = {}) {
  const where = status ? 'WHERE r.status = ?' : '';
  const params = status ? [status] : [];
  const [countRow, rows] = await Promise.all([
    queryOne(`SELECT COUNT(*) AS total FROM reports r ${where}`, params),
    query(`${SELECT_REPORT} ${where} ORDER BY r.status = 'open' DESC, r.created_at DESC LIMIT ? OFFSET ?`, [
      ...params,
      limit,
      (page - 1) * limit,
    ]),
  ]);
  return { rows, total: Number(countRow.total) };
}

export async function countByStatus() {
  const rows = await query('SELECT status, COUNT(*) AS total FROM reports GROUP BY status');
  const counts = Object.fromEntries(REPORT_STATUSES.map((s) => [s, 0]));
  rows.forEach(({ status, total }) => {
    counts[status] = Number(total);
  });
  counts.all = Object.values(counts).reduce((sum, n) => sum + n, 0);
  return counts;
}

export function findById(id) {
  return queryOne(`${SELECT_REPORT} WHERE r.id = ?`, [id]);
}

/**
 * Close a report. Runs inside a transaction (pass conn).
 * Taking a listing down also closes the other open reports of the same listing.
 */
export async function close(conn, { id, listingId, status, closeAllOfListing = false }) {
  if (closeAllOfListing) {
    await conn.query(
      "UPDATE reports SET status = ?, resolved_at = NOW() WHERE listing_id = ? AND status = 'open'",
      [status, listingId],
    );
  } else {
    await conn.query('UPDATE reports SET status = ?, resolved_at = NOW() WHERE id = ?', [status, id]);
  }
}
