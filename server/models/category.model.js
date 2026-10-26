/**
 * Category model: `categories` table.
 */
import { query, queryOne } from '../config/db.js';

export function toCategory(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    icon: row.icon,
    sortOrder: row.sort_order,
    listingCount: Number(row.listing_count ?? 0),
    // Admin page only: total listings in every status (to know whether it can be deleted)
    ...(row.total_count !== undefined && { totalCount: Number(row.total_count) }),
  };
}

/** Categories with their active listing count (status = 'active') */
export function findAllWithCount() {
  return query(
    `SELECT c.id, c.name, c.slug, c.icon, c.sort_order,
            COUNT(l.id) AS listing_count
       FROM categories c
       LEFT JOIN listings l
              ON l.category_id = c.id AND l.status = 'active'
      GROUP BY c.id
      ORDER BY c.sort_order, c.name`,
  );
}

/** Whether a category exists (used when creating/editing listings) */
export async function exists(id) {
  const rows = await query('SELECT id FROM categories WHERE id = ?', [id]);
  return rows.length > 0;
}

// ---------------------------------------------------------
//  Category management (admin)
// ---------------------------------------------------------

/** Categories + active listing count + total listing count (every status) */
export function findAllForAdmin() {
  return query(
    `SELECT c.id, c.name, c.slug, c.icon, c.sort_order,
            COUNT(CASE WHEN l.status = 'active' THEN 1 END) AS listing_count,
            COUNT(l.id) AS total_count
       FROM categories c
       LEFT JOIN listings l ON l.category_id = c.id
      GROUP BY c.id
      ORDER BY c.sort_order, c.name`,
  );
}

export function findById(id) {
  return queryOne(
    `SELECT c.*, (SELECT COUNT(*) FROM listings l WHERE l.category_id = c.id) AS total_count
       FROM categories c WHERE c.id = ?`,
    [id],
  );
}

/** Whether another category already uses the slug (ignores itself when editing) */
export async function slugTaken(slug, exceptId = 0) {
  const row = await queryOne('SELECT id FROM categories WHERE slug = ? AND id <> ?', [slug, exceptId]);
  return Boolean(row);
}

export async function create({ name, slug, icon, sortOrder }) {
  const result = await query('INSERT INTO categories (name, slug, icon, sort_order) VALUES (?, ?, ?, ?)', [
    name,
    slug,
    icon,
    sortOrder,
  ]);
  return result.insertId;
}

export function update(id, { name, slug, icon, sortOrder }) {
  return query('UPDATE categories SET name = ?, slug = ?, icon = ?, sort_order = ? WHERE id = ?', [
    name,
    slug,
    icon,
    sortOrder,
    id,
  ]);
}

export function remove(id) {
  return query('DELETE FROM categories WHERE id = ?', [id]);
}

/** Highest current order -> new categories go last by default */
export async function maxSortOrder() {
  const row = await queryOne('SELECT COALESCE(MAX(sort_order), 0) AS max FROM categories');
  return Number(row.max);
}
