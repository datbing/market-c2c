/**
 * Model Listing: bảng `listings` (+ ảnh đại diện từ `listing_images`).
 */
import { query, queryOne } from '../config/db.js';

/**
 * Whitelist kiểu sắp xếp -> mệnh đề ORDER BY.
 * Không bao giờ nối trực tiếp giá trị người dùng gửi lên vào SQL.
 */
const SORTS = {
  newest: 'l.created_at DESC, l.id DESC',
  price_asc: 'l.price ASC, l.id DESC',
  price_desc: 'l.price DESC, l.id DESC',
  popular: 'l.views DESC, l.id DESC',
};
export const SORT_KEYS = Object.keys(SORTS);
export const CONDITIONS = ['new', 'like_new', 'used'];

/** Đường dẫn ảnh trong DB -> URL dùng được ở frontend */
export function toImageUrl(path) {
  if (!path) return null;
  if (/^(https?:)?\//.test(path)) return path;
  return `/uploads/${path}`;
}

/** Dòng DB -> object JSON rút gọn dùng cho danh sách (card) */
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

/** Escape ký tự đặc biệt của LIKE (% và _) để người dùng gõ "%" không thành wildcard */
const escapeLike = (str) => str.replace(/[\\%_]/g, (ch) => `\\${ch}`);

/**
 * Dựng mệnh đề WHERE cho danh sách công khai.
 * Chỉ lấy tin đang bán (active) của người bán chưa bị khóa.
 * @returns {{ where: string, params: any[] }}
 */
function buildPublicWhere({ keywords = [], category, province, condition, minPrice, maxPrice, excludeId }) {
  const conditions = ["l.status = 'active'", "u.status = 'active'"];
  const params = [];

  // Bỏ 1 tin khỏi kết quả (vd: "tin cùng danh mục" không lặp lại tin đang xem)
  if (excludeId) {
    conditions.push('l.id <> ?');
    params.push(excludeId);
  }

  // Mỗi từ khóa phải xuất hiện trong search_text (đã bỏ dấu) -> tìm kiếm AND
  for (const word of keywords) {
    conditions.push('l.search_text LIKE ?');
    params.push(`%${escapeLike(word)}%`);
  }

  // Danh mục: nhận id (số) hoặc slug
  if (category) {
    if (/^\d+$/.test(category)) {
      conditions.push('c.id = ?');
      params.push(Number(category));
    } else {
      conditions.push('c.slug = ?');
      params.push(category);
    }
  }

  // Tỉnh/thành: so khớp một phần để "Hồ Chí Minh" khớp cả "TP. Hồ Chí Minh"
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
 * Danh sách tin đang bán có lọc + sắp xếp + phân trang.
 * @returns {Promise<{ rows: any[], total: number }>}
 */
export async function findPublic(filters, { sort = 'newest', page = 1, limit = 12 } = {}) {
  const { where, params } = buildPublicWhere(filters);
  const orderBy = SORTS[sort] ?? SORTS.newest;
  const offset = (page - 1) * limit;

  // Đếm tổng và lấy dữ liệu trang hiện tại song song
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
//  Chi tiết 1 tin
// ---------------------------------------------------------

/**
 * Lấy 1 tin (mọi trạng thái) kèm danh mục + người bán.
 * Controller tự quyết định ai được xem tin chưa/không còn bán.
 */
export function findDetailById(id) {
  return queryOne(
    `SELECT l.*,
            c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon,
            u.name AS seller_name, u.avatar AS seller_avatar, u.province AS seller_province,
            u.status AS seller_status, u.created_at AS seller_joined_at,
            (SELECT COUNT(*) FROM listings x
              WHERE x.user_id = u.id AND x.status = 'active') AS seller_active_count,
            (SELECT COUNT(*) FROM listings x
              WHERE x.user_id = u.id AND x.status = 'sold') AS seller_sold_count
       ${FROM_JOIN}
      WHERE l.id = ?`,
    [id],
  );
}

/** Ảnh của 1 tin theo thứ tự hiển thị */
export function findImages(listingId) {
  return query(
    'SELECT id, path FROM listing_images WHERE listing_id = ? ORDER BY sort_order, id',
    [listingId],
  );
}

/** Tăng lượt xem (không cập nhật updated_at để không làm sai "ngày sửa tin") */
export function incrementViews(id) {
  return query('UPDATE listings SET views = views + 1, updated_at = updated_at WHERE id = ?', [id]);
}

/**
 * Dòng DB -> JSON chi tiết.
 * @param {object} row
 * @param {object[]} images
 * @param {{ isOwner: boolean, isAdmin: boolean }} viewer
 *   chủ tin hoặc admin -> thấy thêm lý do bị từ chối
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
