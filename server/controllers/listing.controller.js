/**
 * Controller tin đăng.
 */
import { withTransaction } from '../config/db.js';
import { HttpError } from '../utils/HttpError.js';
import { validate, rules } from '../utils/validate.js';
import { toSearchText } from '../utils/text.js';
import { parseMultipart, getText, getFiles } from '../utils/multipart.js';
import { detectImageType, saveListingImages, removeImages } from '../utils/image-store.js';
import * as Listing from '../models/listing.model.js';
import * as Category from '../models/category.model.js';
import * as Order from '../models/order.model.js';

const MAX_LIMIT = 48;
const DEFAULT_LIMIT = 12;

// Giới hạn ảnh khi đăng tin (frontend đã nén ảnh nên thực tế mỗi ảnh chỉ vài trăm KB)
const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3MB / ảnh
const MAX_REQUEST_BYTES = MAX_IMAGES * MAX_IMAGE_BYTES + 512 * 1024; // + phần chữ
const MAX_PRICE = 2_000_000_000;

/** Quy tắc dữ liệu tin đăng (dùng chung cho tạo và sửa tin) */
const LISTING_SCHEMA = {
  title: [
    rules.required('Vui lòng nhập tiêu đề'),
    rules.minLength(10, 'Tiêu đề tối thiểu 10 ký tự'),
    rules.maxLength(150, 'Tiêu đề tối đa 150 ký tự'),
  ],
  categoryId: [rules.required('Vui lòng chọn danh mục'), rules.integer('Danh mục không hợp lệ')],
  condition: [
    rules.required('Vui lòng chọn tình trạng'),
    rules.oneOf(Listing.CONDITIONS, 'Tình trạng không hợp lệ'),
  ],
  price: [
    rules.required('Vui lòng nhập giá bán'),
    rules.integer('Giá phải là số nguyên'),
    rules.min(0, 'Giá không được âm'),
    rules.max(MAX_PRICE, 'Giá tối đa 2 tỷ đồng'),
  ],
  province: [rules.required('Vui lòng chọn khu vực'), rules.maxLength(100)],
  description: [
    rules.required('Vui lòng nhập mô tả'),
    rules.minLength(20, 'Mô tả tối thiểu 20 ký tự'),
    rules.maxLength(3000, 'Mô tả tối đa 3000 ký tự'),
  ],
};

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

/**
 * Đọc + kiểm tra các trường chữ của tin đăng từ FormData (dùng cho tạo và sửa tin).
 * @returns {Promise<object>} dữ liệu đã chuẩn hóa để lưu DB
 */
async function readListingFields(form) {
  const body = Object.fromEntries(Object.keys(LISTING_SCHEMA).map((name) => [name, getText(form, name)]));
  validate(body, LISTING_SCHEMA);

  const categoryId = Number(body.categoryId);
  if (!(await Category.exists(categoryId))) {
    throw HttpError.unprocessable({ categoryId: 'Danh mục không tồn tại' });
  }

  return {
    categoryId,
    title: body.title,
    description: body.description,
    price: Number(body.price),
    condition: body.condition,
    province: body.province,
    searchText: toSearchText(body.title, body.description),
  };
}

/**
 * Kiểm tra danh sách file ảnh: số lượng, dung lượng, đúng là ảnh JPG/PNG/WebP.
 * @returns {Promise<{ buffer: Buffer, ext: string }[]>}
 */
async function readImageFiles(files, { allowEmpty = false } = {}) {
  if (files.length === 0 && !allowEmpty) throw HttpError.unprocessable({ images: 'Vui lòng thêm ít nhất 1 ảnh' });
  if (files.length > MAX_IMAGES) {
    throw HttpError.unprocessable({ images: `Tối đa ${MAX_IMAGES} ảnh cho mỗi tin` });
  }

  return Promise.all(
    files.map(async (file, index) => {
      if (file.size > MAX_IMAGE_BYTES) {
        throw HttpError.unprocessable({ images: `Ảnh thứ ${index + 1} vượt quá 3MB` });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = detectImageType(buffer);
      if (!ext) {
        throw HttpError.unprocessable({ images: `Ảnh thứ ${index + 1} không phải ảnh JPG, PNG hoặc WebP` });
      }
      return { buffer, ext };
    }),
  );
}

/**
 * POST /api/listings  (đăng nhập)
 * Body: FormData gồm title, categoryId, condition, price, province, description
 *       và nhiều file "images" (thứ tự = thứ tự hiển thị, ảnh đầu là ảnh bìa).
 * Ảnh chỉ được ghi ra đĩa khi dữ liệu hợp lệ; lưu DB lỗi thì xóa các ảnh vừa ghi.
 */
export async function createListing(req, res) {
  const form = await parseMultipart(req, { maxBytes: MAX_REQUEST_BYTES });
  const fields = await readListingFields(form);

  const images = await readImageFiles(getFiles(form, 'images'));
  const imagePaths = await saveListingImages(images);

  let listingId;
  try {
    listingId = await withTransaction((conn) =>
      Listing.createWithImages(conn, { ...fields, userId: req.user.id }, imagePaths),
    );
  } catch (err) {
    await removeImages(imagePaths); // DB lỗi -> không để ảnh mồ côi trong uploads/
    throw err;
  }

  const [row, savedImages] = await Promise.all([
    Listing.findDetailById(listingId),
    Listing.findImages(listingId),
  ]);

  res.status(201).json({
    success: true,
    message: 'Đăng tin thành công! Tin của bạn đang chờ quản trị viên duyệt',
    data: Listing.toListingDetail(row, savedImages, { isOwner: true }),
  });
}

// =========================================================
//  QUẢN LÝ TIN CỦA TÔI (chỉ chủ tin)
// =========================================================

/**
 * Chủ tin được chuyển trạng thái theo bảng này (admin có API riêng để duyệt / từ chối):
 *   active  -> sold (đã bán), hidden (tạm ẩn)
 *   hidden  -> active (hiện lại), sold
 *   sold    -> active (đăng bán lại, vd người mua không lấy nữa)
 *   pending / rejected: chờ admin, chủ tin không tự đổi được
 */
const OWNER_TRANSITIONS = {
  active: ['sold', 'hidden'],
  hidden: ['active', 'sold'],
  sold: ['active'],
  pending: [],
  rejected: [],
};

const STATUS_MESSAGES = {
  sold: 'Đã đánh dấu tin là đã bán',
  hidden: 'Đã ẩn tin, người khác sẽ không nhìn thấy',
  active: 'Tin đã hiển thị trở lại',
};

/** Lấy tin theo :id và chắc chắn người đang đăng nhập là chủ tin */
async function getOwnedListing(req) {
  const id = toPositiveInt(req.params.id, null);
  const row = id ? await Listing.findDetailById(id) : null;
  if (!row) throw HttpError.notFound('Không tìm thấy tin đăng');
  if (row.user_id !== req.user.id) throw HttpError.forbidden('Bạn chỉ được quản lý tin của chính mình');
  return row;
}

/**
 * GET /api/me/listings?status=&q=&page=&limit=  (đăng nhập)
 * Trả thêm meta.counts = số tin theo từng trạng thái (để hiện trên các tab lọc).
 */
export async function listMyListings(req, res) {
  const qs = req.query;
  validate(qs, {
    status: [rules.oneOf(Listing.STATUSES, 'Trạng thái không hợp lệ')],
    q: [rules.maxLength(100, 'Từ khóa tối đa 100 ký tự')],
  });

  const page = toPositiveInt(qs.page, 1);
  const limit = Math.min(toPositiveInt(qs.limit, 10), MAX_LIMIT);
  const keywords = toSearchText(optionalString(qs.q) ?? '').split(' ').filter(Boolean).slice(0, 5);

  const [{ rows, total }, counts] = await Promise.all([
    Listing.findByOwner(req.user.id, { status: optionalString(qs.status), keywords, page, limit }),
    Listing.countByStatus(req.user.id),
  ]);

  res.json({
    success: true,
    data: rows.map(Listing.toOwnerListing),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)), counts },
  });
}

/**
 * PATCH /api/listings/:id/status  { status }  (chủ tin)
 * Dùng cho: đánh dấu đã bán, ẩn tin, hiện lại, đăng bán lại.
 */
export async function updateListingStatus(req, res) {
  const row = await getOwnedListing(req);
  const status = req.body?.status;

  validate({ status }, { status: [rules.required('Thiếu trạng thái mới'), rules.oneOf(Listing.STATUSES)] });

  const allowed = OWNER_TRANSITIONS[row.status] ?? [];
  if (!allowed.includes(status)) {
    const reasons = {
      pending: 'Tin đang chờ duyệt, chưa đổi trạng thái được',
      rejected: 'Tin bị từ chối, hãy sửa tin để gửi duyệt lại',
    };
    throw HttpError.conflict(reasons[row.status] ?? 'Không thể chuyển sang trạng thái này');
  }

  if (['sold', 'hidden'].includes(status) && (await Order.hasOpenOrder(row.id))) {
    throw HttpError.conflict('Tin đang có đơn hàng chưa xử lý xong. Hãy xác nhận hoặc hủy đơn trước.');
  }

  await Listing.updateStatus(row.id, status);
  const [updated, images] = await Promise.all([Listing.findDetailById(row.id), Listing.findImages(row.id)]);

  res.json({
    success: true,
    message: STATUS_MESSAGES[status],
    data: Listing.toListingDetail(updated, images, { isOwner: true }),
  });
}

/**
 * Đọc thứ tự ảnh khi sửa tin.
 * FormData gửi "imageOrder" là JSON, vd ["existing:12", "new:0", "existing:13"]:
 *   existing:<id> = giữ ảnh cũ có id đó, new:<n> = file thứ n trong các file "images" gửi kèm.
 */
function parseImageOrder(raw, { existingIds, newCount }) {
  let order;
  try {
    order = JSON.parse(raw ?? '[]');
  } catch {
    throw HttpError.badRequest('Thứ tự ảnh không hợp lệ');
  }
  if (!Array.isArray(order) || order.length === 0) {
    throw HttpError.unprocessable({ images: 'Vui lòng giữ lại hoặc thêm ít nhất 1 ảnh' });
  }
  if (order.length > MAX_IMAGES) {
    throw HttpError.unprocessable({ images: `Tối đa ${MAX_IMAGES} ảnh cho mỗi tin` });
  }

  const seen = new Set();
  return order.map((token) => {
    const [kind, value] = String(token).split(':');
    const n = Number(value);
    const valid =
      Number.isInteger(n) &&
      !seen.has(token) &&
      ((kind === 'existing' && existingIds.has(n)) || (kind === 'new' && n >= 0 && n < newCount));
    if (!valid) throw HttpError.badRequest('Thứ tự ảnh không hợp lệ');
    seen.add(token);
    return { kind, value: n };
  });
}

/**
 * PUT /api/listings/:id  (chủ tin) - FormData giống lúc đăng + "imageOrder" (xem parseImageOrder)
 * - Tin đã bán không sửa được (đăng bán lại trước)
 * - Tin bị từ chối: sửa xong tự gửi duyệt lại (chuyển "pending", xóa lý do từ chối)
 * - Ảnh mới chỉ ghi ra đĩa khi dữ liệu hợp lệ; ảnh cũ bị bỏ được xóa khỏi đĩa SAU khi lưu DB thành công
 */
export async function updateListing(req, res) {
  const row = await getOwnedListing(req);
  if (row.status === 'sold') throw HttpError.conflict('Tin đã bán không sửa được, hãy đăng bán lại trước');

  const form = await parseMultipart(req, { maxBytes: MAX_REQUEST_BYTES });
  const fields = await readListingFields(form);

  const files = await readImageFiles(getFiles(form, 'images'), { allowEmpty: true });
  const existingIds = new Set((await Listing.findImages(row.id)).map((img) => img.id));
  const order = parseImageOrder(getText(form, 'imageOrder'), { existingIds, newCount: files.length });

  // Chỉ ghi ra đĩa những file mới thực sự có trong thứ tự ảnh.
  // savedPaths[i] ứng với file thứ usedIndexes[i] (theo thứ tự gửi lên, KHÔNG phải thứ tự hiển thị)
  const usedIndexes = files.map((_, i) => i).filter((i) => order.some((o) => o.kind === 'new' && o.value === i));
  const savedPaths = await saveListingImages(usedIndexes.map((i) => files[i]));
  const pathOfNew = new Map(usedIndexes.map((fileIndex, i) => [fileIndex, savedPaths[i]]));
  const finalImages = order.map(({ kind, value }) =>
    kind === 'existing' ? { id: value } : { path: pathOfNew.get(value) },
  );
  const status = row.status === 'rejected' ? 'pending' : row.status;

  let removedPaths;
  try {
    removedPaths = await withTransaction((conn) =>
      Listing.updateWithImages(conn, row.id, { ...fields, status }, finalImages),
    );
  } catch (err) {
    await removeImages(savedPaths); // DB lỗi -> bỏ ảnh mới vừa ghi
    throw err;
  }
  await removeImages(removedPaths); // DB đã lưu xong mới xóa file ảnh cũ bị bỏ

  const [updated, images] = await Promise.all([Listing.findDetailById(row.id), Listing.findImages(row.id)]);
  res.json({
    success: true,
    message: row.status === 'rejected' ? 'Đã lưu, tin được gửi duyệt lại' : 'Đã lưu thay đổi',
    data: Listing.toListingDetail(updated, images, { isOwner: true }),
  });
}

/**
 * DELETE /api/listings/:id  (chủ tin)
 * Tin đã có đơn hàng thì không xóa (đơn còn cần thông tin tin) -> gợi ý ẩn tin.
 */
export async function deleteListing(req, res) {
  const row = await getOwnedListing(req);
  if (await Listing.hasOrders(row.id)) {
    throw HttpError.conflict('Tin đã có đơn hàng nên không xóa được. Bạn có thể ẩn tin hoặc đánh dấu đã bán.');
  }

  const imagePaths = await withTransaction((conn) => Listing.deleteById(conn, row.id));
  await removeImages(imagePaths); // DB đã xóa xong mới xóa file

  res.json({ success: true, message: 'Đã xóa tin đăng' });
}
