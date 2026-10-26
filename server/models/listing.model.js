/**
 * Listing model: `listings` table (+ cover image from `listing_images`).
 */
import { query, queryOne } from '../config/db.js';

/**
 * Sort whitelist -> ORDER BY clause.
 * User input is never concatenated directly into SQL.
 */
const SORTS = {
  newest: 'l.created_at DESC, l.id DESC',
  price_asc: 'l.price ASC, l.id DESC',
  price_desc: 'l.price DESC, l.id DESC',
  popular: 'l.views DESC, l.id DESC',
};
export const SORT_KEYS = Object.keys(SORTS);
export const CONDITIONS = ['new', 'like_new', 'used'];

/** Image path stored in the DB -> URL usable by the frontend */
export function toImageUrl(path) {
  if (!path) return null;
  if (/^(https?:)?\//.test(path)) return path;
  return `/uploads/${path}`;
}

/** DB row -> compact JSON object for lists (cards) */
export function toListingCard(row) {
  return {
    id: row.id,
    title: row.title,
    price: row.price,
    condition: row.item_condition,
    province: row.province,
    status: row.status,
    views: row.views,
    thumbnail: toImageUrl(row.thumbnail),
    createdAt: row.created_at,
    category: {
      id: row.category_id,
      name: row.category_name,
      slug: row.category_slug,
      icon: row.category_icon,
    },
    seller: { id: row.seller_id, name: row.seller_name },
  };
}

/** Escape LIKE special characters (% and _) so a user typing "%" does not get a wildcard */
const escapeLike = (str) => str.replace(/[\\%_]/g, (ch) => `\\${ch}`);

/**
 * Build the WHERE clause for the public list.
 * Only active listings of sellers who are not locked.
 * @returns {{ where: string, params: any[] }}
 */
function buildPublicWhere({ keywords = [], category, province, condition, minPrice, maxPrice, excludeId }) {
  const conditions = ["l.status = 'active'", "u.status = 'active'"];
  const params = [];

  // Leave one listing out (e.g. "related listings" should not repeat the one being viewed)
  if (excludeId) {
    conditions.push('l.id <> ?');
    params.push(excludeId);
  }

  // Every keyword must appear in search_text (without diacritics) -> AND search
  for (const word of keywords) {
    conditions.push('l.search_text LIKE ?');
    params.push(`%${escapeLike(word)}%`);
  }

  // Category: accepts an id (number) or a slug
  if (category) {
    if (/^\d+$/.test(category)) {
      conditions.push('c.id = ?');
      params.push(Number(category));
    } else {
      conditions.push('c.slug = ?');
      params.push(category);
    }
  }

  // Province: partial match so "Hồ Chí Minh" also matches "TP. Hồ Chí Minh"
  if (province) {
    conditions.push('l.province LIKE ?');
    params.push(`%${escapeLike(province)}%`);
  }

  if (condition) {
    conditions.push('l.item_condition = ?');
    params.push(condition);
  }

  if (minPrice !== undefined) {
    conditions.push('l.price >= ?');
    params.push(minPrice);
  }

  if (maxPrice !== undefined) {
    conditions.push('l.price <= ?');
    params.push(maxPrice);
  }

  return { where: conditions.join(' AND '), params };
}

const FROM_JOIN = `
  FROM listings l
  JOIN categories c ON c.id = l.category_id
  JOIN users u      ON u.id = l.user_id`;

/**
 * Active listings with filtering + sorting + pagination.
 * @returns {Promise<{ rows: any[], total: number }>}
 */
export async function findPublic(filters, { sort = 'newest', page = 1, limit = 12 } = {}) {
  const { where, params } = buildPublicWhere(filters);
  const orderBy = SORTS[sort] ?? SORTS.newest;
  const offset = (page - 1) * limit;

  // Count the total and load the current page in parallel
  const [countRow, rows] = await Promise.all([
    queryOne(`SELECT COUNT(*) AS total ${FROM_JOIN} WHERE ${where}`, params),
    query(
      `SELECT l.id, l.title, l.price, l.item_condition, l.province, l.status,
              l.views, l.created_at,
              c.id AS category_id, c.name AS category_name, c.slug AS category_slug,
              c.icon AS category_icon,
              u.id AS seller_id, u.name AS seller_name,
              (SELECT i.path FROM listing_images i
                WHERE i.listing_id = l.id
                ORDER BY i.sort_order, i.id
                LIMIT 1) AS thumbnail
         ${FROM_JOIN}
        WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    ),
  ]);

  return { rows, total: Number(countRow.total) };
}

// ---------------------------------------------------------
//  Listing detail
// ---------------------------------------------------------

/**
 * Load one listing (any status) with its category + seller.
 * The controller decides who may see listings that are not (or no longer) for sale.
 */
export function findDetailById(id) {
  return queryOne(
    `SELECT l.*,
            c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon,
            u.name AS seller_name, u.avatar AS seller_avatar, u.province AS seller_province,
            u.status AS seller_status, u.created_at AS seller_joined_at,
            EXISTS(SELECT 1 FROM orders o
                    WHERE o.listing_id = l.id AND o.status IN ('pending', 'confirmed', 'shipping')) AS has_open_order,
            (SELECT COUNT(*) FROM listings x
              WHERE x.user_id = u.id AND x.status = 'active') AS seller_active_count,
            (SELECT COUNT(*) FROM listings x
              WHERE x.user_id = u.id AND x.status = 'sold') AS seller_sold_count
       ${FROM_JOIN}
      WHERE l.id = ?`,
    [id],
  );
}

/** A listing's images in display order */
export function findImages(listingId) {
  return query(
    'SELECT id, path FROM listing_images WHERE listing_id = ? ORDER BY sort_order, id',
    [listingId],
  );
}

/** Increase the view count (without touching updated_at, so the "edited" date stays correct) */
export function incrementViews(id) {
  return query('UPDATE listings SET views = views + 1, updated_at = updated_at WHERE id = ?', [id]);
}

/**
 * DB row -> detailed JSON.
 * @param {object} row
 * @param {object[]} images
 * @param {{ isOwner: boolean, isAdmin: boolean }} viewer
 *   owner or admin -> also sees the reject reason
 */
export function toListingDetail(row, images, { isOwner = false, isAdmin = false } = {}) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    price: row.price,
    condition: row.item_condition,
    province: row.province,
    status: row.status,
    views: row.views,
    soldAt: row.sold_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...((isOwner || isAdmin) && { rejectReason: row.reject_reason }),
    isOwner,
    // An open order exists -> the item is being held for the buyer
    reserved: Boolean(row.has_open_order),
    category: {
      id: row.category_id,
      name: row.category_name,
      slug: row.category_slug,
      icon: row.category_icon,
    },
    seller: {
      id: row.user_id,
      name: row.seller_name,
      avatar: toImageUrl(row.seller_avatar),
      province: row.seller_province,
      joinedAt: row.seller_joined_at,
      activeCount: Number(row.seller_active_count),
      soldCount: Number(row.seller_sold_count),
    },
    images: images.map((img) => ({ id: img.id, url: toImageUrl(img.path) })),
  };
}

// ---------------------------------------------------------
//  Creating listings
// ---------------------------------------------------------

/**
 * Insert a new listing (status "pending" - waiting for admin review) with its images.
 * Runs inside a transaction: pass the `conn` from withTransaction().
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {object} data
 * @param {string[]} imagePaths  image paths in display order (the first one is the cover)
 * @returns {Promise<number>} id of the new listing
 */
export async function createWithImages(conn, data, imagePaths) {
  const { userId, categoryId, title, description, price, condition, province, searchText } = data;

  const [result] = await conn.query(
    `INSERT INTO listings
       (user_id, category_id, title, description, price, item_condition, province, status, search_text)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [userId, categoryId, title, description, price, condition, province, searchText],
  );
  const listingId = result.insertId;

  if (imagePaths.length > 0) {
    // Insert several rows at once: VALUES ? with a 2D array (mysql2 escapes every value)
    await conn.query('INSERT INTO listing_images (listing_id, path, sort_order) VALUES ?', [
      imagePaths.map((imagePath, index) => [listingId, imagePath, index]),
    ]);
  }
  return listingId;
}

// ---------------------------------------------------------
//  My listings (sellers managing their listings)
// ---------------------------------------------------------
export const STATUSES = ['pending', 'active', 'sold', 'hidden', 'rejected'];

/**
 * A user's listings (any status), filtered by status + keyword, newest first.
 * @returns {Promise<{ rows: any[], total: number }>}
 */
export async function findByOwner(userId, { status, keywords = [], page = 1, limit = 10 } = {}) {
  const conditions = ['l.user_id = ?'];
  const params = [userId];

  if (status) {
    conditions.push('l.status = ?');
    params.push(status);
  }
  for (const word of keywords) {
    conditions.push('l.search_text LIKE ?');
    params.push(`%${escapeLike(word)}%`);
  }
  const where = conditions.join(' AND ');

  const [countRow, rows] = await Promise.all([
    queryOne(`SELECT COUNT(*) AS total ${FROM_JOIN} WHERE ${where}`, params),
    query(
      `SELECT l.id, l.title, l.price, l.item_condition, l.province, l.status, l.reject_reason,
              l.views, l.sold_at, l.created_at, l.updated_at,
              c.id AS category_id, c.name AS category_name, c.slug AS category_slug,
              c.icon AS category_icon,
              u.id AS seller_id, u.name AS seller_name,
              (SELECT i.path FROM listing_images i
                WHERE i.listing_id = l.id ORDER BY i.sort_order, i.id LIMIT 1) AS thumbnail,
              (SELECT COUNT(*) FROM orders o WHERE o.listing_id = l.id) AS order_count
         ${FROM_JOIN}
        WHERE ${where}
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit],
    ),
  ]);
  return { rows, total: Number(countRow.total) };
}

/** Listing count per status for one user: { all, pending, active, sold, hidden, rejected } */
export async function countByStatus(userId) {
  const rows = await query(
    'SELECT status, COUNT(*) AS total FROM listings WHERE user_id = ? GROUP BY status',
    [userId],
  );
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  rows.forEach(({ status, total }) => {
    counts[status] = Number(total);
  });
  counts.all = Object.values(counts).reduce((sum, n) => sum + n, 0);
  return counts;
}

/** "My listings" row -> JSON: like a card + reject reason, sold date, order count */
export function toOwnerListing(row) {
  return {
    ...toListingCard(row),
    rejectReason: row.reject_reason,
    soldAt: row.sold_at,
    updatedAt: row.updated_at,
    orderCount: Number(row.order_count ?? 0),
  };
}

/** Change the status. Moving to "sold" records the sold date, leaving "sold" clears it */
export function updateStatus(id, status) {
  return query(
    `UPDATE listings
        SET status = ?,
            sold_at = CASE WHEN ? = 'sold' THEN NOW() ELSE NULL END
      WHERE id = ?`,
    [status, status, id],
  );
}

/** Whether the listing already has orders (if so it cannot be deleted, orders still reference it) */
export async function hasOrders(id) {
  const row = await queryOne('SELECT COUNT(*) AS total FROM orders WHERE listing_id = ?', [id]);
  return Number(row.total) > 0;
}

/**
 * Delete a listing (its image rows are removed by ON DELETE CASCADE).
 * @returns {Promise<string[]>} image file paths to delete from disk afterwards
 */
export async function deleteById(conn, id) {
  const [images] = await conn.query('SELECT path FROM listing_images WHERE listing_id = ?', [id]);
  await conn.query('DELETE FROM listings WHERE id = ?', [id]);
  return images.map((img) => img.path);
}

/**
 * Edit a listing + reorder its images.
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {number} id
 * @param {object} data  columns to update (same as createWithImages) + the new status (if it changes)
 * @param {{ id?: number, path?: string }[]} finalImages  final image list in order:
 *        kept old images have an `id`, new images have a `path`
 * @returns {Promise<string[]>} paths of removed old images -> delete from disk after commit
 */
export async function updateWithImages(conn, id, data, finalImages) {
  const { categoryId, title, description, price, condition, province, searchText, status } = data;

  await conn.query(
    `UPDATE listings
        SET category_id = ?, title = ?, description = ?, price = ?, item_condition = ?,
            province = ?, search_text = ?,
            status = ?, reject_reason = CASE WHEN ? = 'pending' THEN NULL ELSE reject_reason END
      WHERE id = ?`,
    [categoryId, title, description, price, condition, province, searchText, status, status, id],
  );

  // Old images no longer in the list -> delete the DB rows, return the paths to delete the files
  const [oldImages] = await conn.query('SELECT id, path FROM listing_images WHERE listing_id = ?', [id]);
  const keptIds = new Set(finalImages.filter((img) => img.id).map((img) => img.id));
  const removed = oldImages.filter((img) => !keptIds.has(img.id));
  if (removed.length > 0) {
    await conn.query('DELETE FROM listing_images WHERE id IN (?)', [removed.map((img) => img.id)]);
  }

  // Update the order of old images + insert new images at the right positions
  for (const [index, image] of finalImages.entries()) {
    if (image.id) {
      await conn.query('UPDATE listing_images SET sort_order = ? WHERE id = ?', [index, image.id]);
    } else {
      await conn.query('INSERT INTO listing_images (listing_id, path, sort_order) VALUES (?, ?, ?)', [
        id,
        image.path,
        index,
      ]);
    }
  }
  return removed.map((img) => img.path);
}
