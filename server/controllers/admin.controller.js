/**
 * Admin controller (every route goes through requireAuth + requireAdmin).
 */
import { withTransaction } from '../config/db.js';
import { HttpError } from '../utils/HttpError.js';
import { validate, rules } from '../utils/validate.js';
import { toSearchText, slugify } from '../utils/text.js';
import * as Admin from '../models/admin.model.js';
import * as Category from '../models/category.model.js';
import * as Order from '../models/order.model.js';
import * as Report from '../models/report.model.js';
import * as Listing from '../models/listing.model.js';

const toPositiveInt = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

const optionalString = (value) => {
  const str = typeof value === 'string' ? value.trim() : '';
  return str || undefined;
};

/** Read page / limit from the query string */
const paging = (qs, defaultLimit = 10) => ({
  page: toPositiveInt(qs.page, 1),
  limit: Math.min(toPositiveInt(qs.limit, defaultLimit), 50),
});

const pageMeta = ({ page, limit }, total, extra = {}) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
  ...extra,
});

// =========================================================
//  DASHBOARD
// =========================================================

/** GET /api/admin/stats?days=14 */
export async function getStats(req, res) {
  const days = Math.min(Math.max(toPositiveInt(req.query.days, 14), 7), 60);
  res.json({ success: true, data: await Admin.getStats(days) });
}

// =========================================================
//  LISTING REVIEW
// =========================================================

/** GET /api/admin/listings?status=&q=&page= */
export async function listListings(req, res) {
  const qs = req.query;
  validate(qs, { status: [rules.oneOf(Listing.STATUSES, 'Trạng thái không hợp lệ')], q: [rules.maxLength(100)] });

  const p = paging(qs);
  const keywords = toSearchText(optionalString(qs.q) ?? '').split(' ').filter(Boolean).slice(0, 5);
  const { rows, total, counts } = await Admin.findListings({ status: optionalString(qs.status), keywords, ...p });

  res.json({ success: true, data: rows.map(Admin.toAdminListing), meta: pageMeta(p, total, { counts }) });
}

/**
 * What the admin can do with a listing based on its current status:
 *   approve (-> active): from pending, rejected
 *   reject  (reject / take down -> rejected, a reason is required): from pending, active, hidden
 */
const REVIEW_ACTIONS = {
  approve: { from: ['pending', 'rejected'], to: 'active', message: 'Đã duyệt tin, tin đã hiển thị công khai' },
  reject: { from: ['pending', 'active', 'hidden'], to: 'rejected', message: 'Đã từ chối / gỡ tin' },
};

/** PATCH /api/admin/listings/:id/review  { action: 'approve'|'reject', reason? } */
export async function reviewListing(req, res) {
  const body = req.body ?? {};
  validate(body, {
    action: [rules.required('Thiếu thao tác'), rules.oneOf(Object.keys(REVIEW_ACTIONS), 'Thao tác không hợp lệ')],
    reason: [
      (v, data) => (data.action === 'reject' && !String(v ?? '').trim() ? 'Vui lòng nhập lý do từ chối' : null),
      rules.maxLength(255, 'Lý do tối đa 255 ký tự'),
    ],
  });

  const id = toPositiveInt(req.params.id, null);
  const listing = id ? await Listing.findDetailById(id) : null;
  if (!listing) throw HttpError.notFound('Không tìm thấy tin đăng');

  const action = REVIEW_ACTIONS[body.action];
  if (!action.from.includes(listing.status)) {
    throw HttpError.conflict(`Tin đang ở trạng thái "${listing.status}", không thực hiện được thao tác này`);
  }
  if (action.to === 'rejected' && (await Order.hasOpenOrder(id))) {
    throw HttpError.conflict('Tin đang có đơn hàng chưa xử lý xong, chưa gỡ được');
  }

  await Admin.setListingReview(id, action.to, optionalString(body.reason) ?? null);
  res.json({ success: true, message: action.message });
}

// =========================================================
//  USERS
// =========================================================

/** GET /api/admin/users?q=&status=&page= */
export async function listUsers(req, res) {
  const qs = req.query;
  validate(qs, { status: [rules.oneOf(['active', 'locked'], 'Trạng thái không hợp lệ')], q: [rules.maxLength(100)] });

  const p = paging(qs);
  const { rows, total, counts } = await Admin.findUsers({
    q: optionalString(qs.q),
    status: optionalString(qs.status),
    ...p,
  });
  res.json({ success: true, data: rows.map(Admin.toAdminUser), meta: pageMeta(p, total, { counts }) });
}

/**
 * PATCH /api/admin/users/:id/status  { status: 'active'|'locked' }
 * Admins cannot lock themselves or other admins.
 * Once locked, the user is logged out on the next request (requireAuth re-reads the status),
 * and their listings disappear from public lists (queries filter on u.status = 'active').
 */
export async function updateUserStatus(req, res) {
  const status = req.body?.status;
  validate({ status }, { status: [rules.required('Thiếu trạng thái'), rules.oneOf(['active', 'locked'])] });

  const id = toPositiveInt(req.params.id, null);
  const user = id ? await Admin.findUserById(id) : null;
  if (!user) throw HttpError.notFound('Không tìm thấy người dùng');
  if (user.id === req.user.id) throw HttpError.badRequest('Bạn không thể tự khóa tài khoản của mình');
  if (user.role === 'admin') throw HttpError.forbidden('Không thể khóa tài khoản quản trị viên');

  await Admin.setUserStatus(id, status);
  res.json({
    success: true,
    message: status === 'locked' ? `Đã khóa tài khoản ${user.name}` : `Đã mở khóa tài khoản ${user.name}`,
  });
}

// =========================================================
//  CATEGORIES
// =========================================================
const ICON_RE = /^bi-[a-z0-9-]+$/;

const CATEGORY_SCHEMA = {
  name: [rules.required('Vui lòng nhập tên danh mục'), rules.minLength(2), rules.maxLength(100)],
  icon: [rules.pattern(ICON_RE, 'Icon phải là class Bootstrap Icons, vd: bi-phone'), rules.maxLength(50)],
  sortOrder: [rules.integer('Thứ tự phải là số nguyên'), rules.min(0, 'Thứ tự không được âm')],
};

/** Read + validate category data, generate the slug from the name (duplicate slug -> error on the name field) */
async function readCategory(body, exceptId = 0) {
  validate(body, CATEGORY_SCHEMA);
  const name = String(body.name).trim();
  const slug = slugify(name);
  if (!slug) throw HttpError.unprocessable({ name: 'Tên danh mục không hợp lệ' });
  if (await Category.slugTaken(slug, exceptId)) {
    throw HttpError.conflict('Danh mục đã tồn tại', { name: 'Đã có danh mục trùng tên' });
  }
  const sortOrder =
    optionalString(String(body.sortOrder ?? '')) !== undefined ? Number(body.sortOrder) : (await Category.maxSortOrder()) + 1;
  return { name, slug, icon: optionalString(body.icon) ?? 'bi-tag', sortOrder };
}

/** GET /api/admin/categories */
export async function listCategories(req, res) {
  const rows = await Category.findAllForAdmin();
  res.json({ success: true, data: rows.map(Category.toCategory) });
}

/** POST /api/admin/categories  { name, icon?, sortOrder? } */
export async function createCategory(req, res) {
  const data = await readCategory(req.body ?? {});
  const id = await Category.create(data);
  res.status(201).json({ success: true, message: 'Đã thêm danh mục', data: Category.toCategory(await Category.findById(id)) });
}

/** PUT /api/admin/categories/:id */
export async function updateCategory(req, res) {
  const id = toPositiveInt(req.params.id, null);
  if (!id || !(await Category.findById(id))) throw HttpError.notFound('Không tìm thấy danh mục');
  const data = await readCategory(req.body ?? {}, id);
  await Category.update(id, data);
  res.json({ success: true, message: 'Đã lưu danh mục', data: Category.toCategory(await Category.findById(id)) });
}

/** DELETE /api/admin/categories/:id - refuses while the category still has listings */
export async function deleteCategory(req, res) {
  const id = toPositiveInt(req.params.id, null);
  const category = id ? await Category.findById(id) : null;
  if (!category) throw HttpError.notFound('Không tìm thấy danh mục');
  if (Number(category.total_count) > 0) {
    throw HttpError.conflict(`Danh mục còn ${category.total_count} tin đăng, hãy chuyển tin sang danh mục khác trước`);
  }
  await Category.remove(id);
  res.json({ success: true, message: `Đã xóa danh mục "${category.name}"` });
}

// =========================================================
//  REPORTS
// =========================================================

/** GET /api/admin/reports?status=&page= */
export async function listReports(req, res) {
  const qs = req.query;
  validate(qs, { status: [rules.oneOf(Report.REPORT_STATUSES, 'Trạng thái không hợp lệ')] });
  const p = paging(qs);
  const [{ rows, total }, counts] = await Promise.all([
    Report.findAll({ status: optionalString(qs.status), ...p }),
    Report.countByStatus(),
  ]);
  res.json({ success: true, data: rows.map(Report.toReport), meta: pageMeta(p, total, { counts }) });
}

/**
 * PATCH /api/admin/reports/:id  { action: 'dismiss'|'resolve'|'takedown', reason? }
 *   dismiss  : invalid report -> ignore it
 *   resolve  : handled (e.g. the seller was warned), the listing stays
 *   takedown : remove the listing (-> rejected, reason = given reason or the report reason) + close every report of that listing
 */
export async function handleReport(req, res) {
  const body = req.body ?? {};
  validate(body, {
    action: [rules.required('Thiếu thao tác'), rules.oneOf(['dismiss', 'resolve', 'takedown'], 'Thao tác không hợp lệ')],
    reason: [rules.maxLength(255, 'Lý do tối đa 255 ký tự')],
  });

  const id = toPositiveInt(req.params.id, null);
  const report = id ? await Report.findById(id) : null;
  if (!report) throw HttpError.notFound('Không tìm thấy báo cáo');
  if (report.status !== 'open') throw HttpError.conflict('Báo cáo này đã được xử lý');

  if (body.action === 'takedown' && (await Order.hasOpenOrder(report.listing_id))) {
    throw HttpError.conflict('Tin đang có đơn hàng chưa xử lý xong, chưa gỡ được');
  }

  await withTransaction(async (conn) => {
    if (body.action === 'takedown') {
      const reason = `Vi phạm: ${optionalString(body.reason) ?? report.reason}`.slice(0, 255);
      await Admin.takeDownListing(conn, report.listing_id, reason);
    }
    await Report.close(conn, {
      id,
      listingId: report.listing_id,
      status: body.action === 'dismiss' ? 'dismissed' : 'resolved',
      closeAllOfListing: body.action === 'takedown',
    });
  });

  const messages = {
    dismiss: 'Đã bỏ qua báo cáo',
    resolve: 'Đã đánh dấu báo cáo là đã xử lý',
    takedown: 'Đã gỡ tin vi phạm và đóng các báo cáo liên quan',
  };
  res.json({ success: true, message: messages[body.action] });
}
