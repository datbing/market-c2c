/**
 * Model Order: bảng `orders`.
 * Mỗi đơn = 1 món (1 tin đăng) của 1 người bán. Đơn lưu "ảnh chụp" tiêu đề + giá lúc đặt.
 */
import { query, queryOne } from '../config/db.js';
import { toImageUrl } from './listing.model.js';

export const ORDER_STATUSES = ['pending', 'confirmed', 'shipping', 'completed', 'cancelled'];
/** Đơn còn đang xử lý: món đồ đang được "giữ" cho người đặt */
export const OPEN_STATUSES = ['pending', 'confirmed', 'shipping'];

/** Cột + JOIN dùng chung khi đọc đơn */
const SELECT_ORDER = `
  SELECT o.*,
         l.status AS listing_status,
         (SELECT i.path FROM listing_images i
           WHERE i.listing_id = o.listing_id ORDER BY i.sort_order, i.id LIMIT 1) AS thumbnail,
         b.name AS buyer_name, b.phone AS buyer_phone,
         s.name AS seller_name, s.phone AS seller_phone
    FROM orders o
    JOIN listings l ON l.id = o.listing_id
    JOIN users b    ON b.id = o.buyer_id
    JOIN users s    ON s.id = o.seller_id`;

/**
 * Dòng DB -> JSON.
 * @param {object} row
 * @param {number} viewerId  người đang xem -> biết mình là người mua hay người bán
 */
export function toOrder(row, viewerId) {
  const myRole = row.buyer_id === viewerId ? 'buyer' : row.seller_id === viewerId ? 'seller' : 'admin';
  return {
    id: row.id,
    status: row.status,
    price: row.price,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    myRole,
    listing: {
      id: row.listing_id,
      title: row.listing_title, // tiêu đề lúc đặt (không đổi khi người bán sửa tin)
      thumbnail: toImageUrl(row.thumbnail),
      status: row.listing_status,
    },
    receiver: {
      name: row.receiver_name,
      phone: row.receiver_phone,
      address: row.address,
      province: row.province,
    },
    buyer: { id: row.buyer_id, name: row.buyer_name, phone: row.buyer_phone },
    seller: { id: row.seller_id, name: row.seller_name, phone: row.seller_phone },
  };
}

// ---------------------------------------------------------
//  Đặt hàng (chạy trong transaction)
// ---------------------------------------------------------

/**
 * Đọc + KHÓA các tin cần đặt (SELECT ... FOR UPDATE).
 * 2 người cùng bấm đặt 1 món: người thứ 2 phải đợi người thứ 1 xong transaction,
 * lúc đó sẽ thấy món đã có đơn -> không bị đặt trùng.
 */
export async function lockListings(conn, listingIds) {
  const [rows] = await conn.query(
    `SELECT l.id, l.user_id, l.title, l.price, l.status, u.status AS seller_status
       FROM listings l
       JOIN users u ON u.id = l.user_id
      WHERE l.id IN (?)
        FOR UPDATE`,
    [listingIds],
  );
  return rows;
}

/** Trong các tin này, tin nào đang có đơn chưa xong */
export async function findListingsWithOpenOrder(conn, listingIds) {
  const [rows] = await conn.query(
    'SELECT DISTINCT listing_id FROM orders WHERE listing_id IN (?) AND status IN (?)',
    [listingIds, OPEN_STATUSES],
  );
  return new Set(rows.map((r) => r.listing_id));
}

/** Tạo 1 đơn, trả về id */
export async function create(conn, data) {
  const [result] = await conn.query(
    `INSERT INTO orders
       (listing_id, buyer_id, seller_id, listing_title, price,
        receiver_name, receiver_phone, address, province, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.listingId, data.buyerId, data.sellerId, data.listingTitle, data.price,
      data.receiverName, data.receiverPhone, data.address, data.province, data.note,
    ],
  );
  return result.insertId;
}

// ---------------------------------------------------------
//  Đọc đơn
// ---------------------------------------------------------

/** role 'buyer' -> đơn mua của tôi, 'seller' -> đơn bán của tôi */
const roleColumn = (role) => (role === 'seller' ? 'o.seller_id' : 'o.buyer_id');

export async function findForUser(userId, role, { status, page = 1, limit = 10 } = {}) {
  const conditions = [`${roleColumn(role)} = ?`];
  const params = [userId];
  if (status) {
    conditions.push('o.status = ?');
    params.push(status);
  }
  const where = conditions.join(' AND ');

  const [countRow, rows] = await Promise.all([
    queryOne(`SELECT COUNT(*) AS total FROM orders o WHERE ${where}`, params),
    query(`${SELECT_ORDER} WHERE ${where} ORDER BY o.created_at DESC, o.id DESC LIMIT ? OFFSET ?`, [
      ...params,
      limit,
      (page - 1) * limit,
    ]),
  ]);
  return { rows, total: Number(countRow.total) };
}

/** Số đơn theo từng trạng thái: { all, pending, confirmed, shipping, completed, cancelled } */
export async function countByStatus(userId, role) {
  const rows = await query(
    `SELECT o.status, COUNT(*) AS total FROM orders o WHERE ${roleColumn(role)} = ? GROUP BY o.status`,
    [userId],
  );
  const counts = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0]));
  rows.forEach(({ status, total }) => {
    counts[status] = Number(total);
  });
  counts.all = Object.values(counts).reduce((sum, n) => sum + n, 0);
  return counts;
}

export function findById(id) {
  return queryOne(`${SELECT_ORDER} WHERE o.id = ?`, [id]);
}

/** Tin này có đơn đang xử lý không (dùng khi người bán đổi trạng thái tin) */
export async function hasOpenOrder(listingId) {
  const row = await queryOne(
    'SELECT COUNT(*) AS total FROM orders WHERE listing_id = ? AND status IN (?)',
    [listingId, OPEN_STATUSES],
  );
  return Number(row.total) > 0;
}

// ---------------------------------------------------------
//  Đổi trạng thái (chạy trong transaction)
// ---------------------------------------------------------

/** Khóa 1 đơn để đổi trạng thái (tránh 2 thao tác cùng lúc trên 1 đơn) */
export async function lockById(conn, id) {
  const [rows] = await conn.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [id]);
  return rows[0] ?? null;
}

export async function updateStatus(conn, id, status) {
  await conn.query(
    `UPDATE orders
        SET status = ?, completed_at = CASE WHEN ? = 'completed' THEN NOW() ELSE completed_at END
      WHERE id = ?`,
    [status, status, id],
  );
}

/** Đơn hoàn thành -> tin chuyển "đã bán" */
export async function markListingSold(conn, listingId) {
  await conn.query("UPDATE listings SET status = 'sold', sold_at = NOW() WHERE id = ?", [listingId]);
}

/**
 * Số đơn đang chờ người dùng xử lý:
 *  - seller: đơn chờ xác nhận + đã xác nhận nhưng chưa giao
 *  - buyer : đơn đang giao (chờ bấm "đã nhận hàng")
 * @returns {Promise<{ seller: number, buyer: number }>}
 */
export async function countNeedAction(userId) {
  const row = await queryOne(
    `SELECT
       SUM(seller_id = ? AND status IN ('pending', 'confirmed')) AS seller,
       SUM(buyer_id = ? AND status = 'shipping') AS buyer
     FROM orders
     WHERE seller_id = ? OR buyer_id = ?`,
    [userId, userId, userId, userId],
  );
  return { seller: Number(row?.seller ?? 0), buyer: Number(row?.buyer ?? 0) };
}
