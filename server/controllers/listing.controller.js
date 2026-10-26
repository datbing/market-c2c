/**
 * Controller tin đăng.
 */
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
 * Query: q, category (id|slug), province, condition, minPrice, maxPrice, sort, page, limit
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
    },
    { sort: optionalString(qs.sort) ?? 'newest', page, limit },
  );

  res.json({
    success: true,
    data: rows.map(Listing.toListingCard),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
}
