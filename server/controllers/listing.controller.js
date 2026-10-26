/**
 * Controller tin đăng.
 */
import { HttpError } from '../utils/HttpError.js';
import { validate, rules } from '../utils/validate.js';
import { toSearchText } from '../utils/text.js';
import * as Listing from '../models/listing.model.js';

const MAX_LIMIT = 48;
const DEFAULT_LIMIT = 12;

/** Chuyển query string sang số nguyên dương, sai thì dùng giá trị mặc định */
const toPositiveInt = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

/** Chuỗi rỗng / không có -> undefined, ngược lại -> chuỗi đã trim */
const optionalString = (value) => {
  const str = typeof value === 'string' ? value.trim() : '';
  return str || undefined;
};

/**
 * GET /api/listings
 * Query: q, category (id|slug), province, condition, minPrice, maxPrice, sort, page, limit,
 *        exclude (id tin cần bỏ ra, dùng cho "tin cùng danh mục")
 */
export async function listListings(req, res) {
  const qs = req.query;

  validate(qs, {
    q: [rules.maxLength(100, 'Từ khóa tối đa 100 ký tự')],
    condition: [rules.oneOf(Listing.CONDITIONS, 'Tình trạng không hợp lệ')],
    minPrice: [rules.integer('Giá thấp nhất phải là số'), rules.min(0, 'Giá không được âm')],
    maxPrice: [rules.integer('Giá cao nhất phải là số'), rules.min(0, 'Giá không được âm')],
    sort: [rules.oneOf(Listing.SORT_KEYS, 'Kiểu sắp xếp không hợp lệ')],
  });

  const minPrice = optionalString(qs.minPrice) && Number(qs.minPrice);
  const maxPrice = optionalString(qs.maxPrice) && Number(qs.maxPrice);

  // Từ khóa -> bỏ dấu, tách thành từng từ (tối đa 5 từ cho nhẹ truy vấn)
  const keywords = toSearchText(optionalString(qs.q) ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 5);

  const page = toPositiveInt(qs.page, 1);
  const limit = Math.min(toPositiveInt(qs.limit, DEFAULT_LIMIT), MAX_LIMIT);

  const { rows, total } = await Listing.findPublic(
    {
      keywords,
      category: optionalString(qs.category),
      province: optionalString(qs.province),
      condition: optionalString(qs.condition),
      minPrice,
      maxPrice,
      excludeId: toPositiveInt(qs.exclude, undefined),
    },
    { sort: optionalString(qs.sort) ?? 'newest', page, limit },
  );

  res.json({
    success: true,
    data: rows.map(Listing.toListingCard),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
}

/**
 * GET /api/listings/:id
 * - Tin đang bán (active) của người bán chưa bị khóa: ai cũng xem được, tăng lượt xem
 *   (trừ khi chính chủ tin xem).
 * - Tin đã bán (sold): ai cũng xem được để biết là đã bán, không tăng lượt xem.
 * - Tin chờ duyệt / ẩn / bị từ chối: chỉ chủ tin và admin xem được.
 *   Người khác nhận 404 như tin không tồn tại -> không lộ thông tin.
 */
export async function getListing(req, res) {
  const id = toPositiveInt(req.params.id, null);
  if (!id) throw HttpError.notFound('Không tìm thấy tin đăng');

  const row = await Listing.findDetailById(id);
  if (!row) throw HttpError.notFound('Không tìm thấy tin đăng');

  const isOwner = req.user?.id === row.user_id;
  const isAdmin = req.user?.role === 'admin';
  const isPublic = row.status === 'active' && row.seller_status === 'active';

  // Tin đã bán vẫn cho người khác xem (biết là "đã bán"), các trạng thái còn lại thì không
  const visibleToPublic = isPublic || (row.status === 'sold' && row.seller_status === 'active');
  if (!visibleToPublic && !isOwner && !isAdmin) {
    throw HttpError.notFound('Không tìm thấy tin đăng');
  }

  if (isPublic && !isOwner) {
    await Listing.incrementViews(id);
    row.views += 1;
  }

  const images = await Listing.findImages(id);
  res.json({ success: true, data: Listing.toListingDetail(row, images, { isOwner, isAdmin }) });
}
