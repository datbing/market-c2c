/**
 * Model Category: bảng `categories`.
 */
import { query } from '../config/db.js';

export function toCategory(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    icon: row.icon,
    sortOrder: row.sort_order,
    listingCount: Number(row.listing_count ?? 0),
  };
}

/** Danh sách danh mục kèm số tin đang bán (status = 'active') */
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
