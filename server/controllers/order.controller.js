/**
 * Controller đơn hàng.
 * Mỗi món trong giỏ -> 1 đơn riêng (mỗi tin = 1 món của 1 người bán).
 */
import { withTransaction } from '../config/db.js';
import { HttpError } from '../utils/HttpError.js';
import { validate, rules } from '../utils/validate.js';
import * as Order from '../models/order.model.js';

const PHONE_RE = /^0\d{9}$/;
const MAX_ITEMS = 20;

/** Chuyển sang số nguyên dương, sai thì trả fallback */
const toPositiveInt = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

/**
 * Ai được chuyển đơn từ trạng thái nào sang trạng thái nào.
 *   pending   -> confirmed (người bán xác nhận), cancelled (người bán hoặc người mua hủy)
 *   confirmed -> shipping (người bán giao hàng), cancelled (người bán hủy)
 *   shipping  -> completed (người bán, hoặc người mua bấm "đã nhận hàng")
 *   completed / cancelled: kết thúc, không đổi nữa
 * Đơn hoàn thành -> tin tự chuyển "đã bán".
 */
const TRANSITIONS = {
  pending: { confirmed: ['seller'], cancelled: ['seller', 'buyer'] },
  confirmed: { shipping: ['seller'], cancelled: ['seller'] },
  shipping: { completed: ['seller', 'buyer'] },
  completed: {},
  cancelled: {},
};

const STATUS_MESSAGES = {
  confirmed: 'Đã xác nhận đơn hàng',
  shipping: 'Đơn đã chuyển sang đang giao',
  completed: 'Đơn hàng đã hoàn thành, tin đã chuyển sang "Đã bán"',
  cancelled: 'Đã hủy đơn hàng',
};

/**
 * POST /api/orders  (đăng nhập)
 * Body: { listingIds: number[], receiverName, receiverPhone, address, province, note? }
 * Tạo tất cả đơn trong 1 transaction: 1 món lỗi thì không tạo đơn nào, báo rõ món nào lỗi.
 */
export async function createOrders(req, res) {
  const body = req.body ?? {};

  validate(body, {
    receiverName: [rules.required('Vui lòng nhập tên người nhận'), rules.minLength(2), rules.maxLength(100)],
    receiverPhone: [
      rules.required('Vui lòng nhập số điện thoại'),
      rules.pattern(PHONE_RE, 'Số điện thoại gồm 10 số và bắt đầu bằng 0'),
    ],
    address: [
      rules.required('Vui lòng nhập địa chỉ nhận hàng'),
      rules.minLength(5, 'Địa chỉ quá ngắn'),
      rules.maxLength(255, 'Địa chỉ tối đa 255 ký tự'),
    ],
    province: [rules.required('Vui lòng chọn tỉnh / thành'), rules.maxLength(100)],
    note: [rules.maxLength(500, 'Ghi chú tối đa 500 ký tự')],
  });

  // Danh sách tin: mảng số nguyên dương, không trùng
  const listingIds = Array.isArray(body.listingIds)
    ? [...new Set(body.listingIds.map((id) => toPositiveInt(id, null)))]
    : [];
  if (listingIds.length === 0 || listingIds.includes(null)) {
    throw HttpError.unprocessable({ listingIds: 'Vui lòng chọn ít nhất 1 món để đặt' });
  }
  if (listingIds.length > MAX_ITEMS) {
    throw HttpError.unprocessable({ listingIds: `Mỗi lần đặt tối đa ${MAX_ITEMS} món` });
  }

  const buyerId = req.user.id;
  const orderIds = await withTransaction(async (conn) => {
    const listings = await Order.lockListings(conn, listingIds);
    const byId = new Map(listings.map((l) => [l.id, l]));
    const reserved = await Order.findListingsWithOpenOrder(conn, listingIds);

    // Kiểm tra từng món, gom tất cả lỗi để báo một lần
    const problems = listingIds
      .map((id) => {
        const l = byId.get(id);
        if (!l) return { listingId: id, reason: 'Tin không còn tồn tại' };
        if (l.user_id === buyerId) return { listingId: id, title: l.title, reason: 'Bạn không thể mua tin của chính mình' };
        if (l.status !== 'active' || l.seller_status !== 'active') {
          return { listingId: id, title: l.title, reason: l.status === 'sold' ? 'Món đồ đã được bán' : 'Tin không còn bán' };
        }
        if (reserved.has(id)) return { listingId: id, title: l.title, reason: 'Đã có người khác đặt món này' };
        return null;
      })
      .filter(Boolean);

    if (problems.length > 0) {
      const err = new HttpError(409, 'Một số món không đặt được, vui lòng kiểm tra lại giỏ hàng');
      err.errors = { items: problems };
      throw err;
    }

    const ids = [];
    for (const id of listingIds) {
      const l = byId.get(id);
      ids.push(
        await Order.create(conn, {
          listingId: id,
          buyerId,
          sellerId: l.user_id,
          listingTitle: l.title,
          price: l.price,
          receiverName: body.receiverName.trim(),
          receiverPhone: body.receiverPhone.trim(),
          address: body.address.trim(),
          province: body.province.trim(),
          note: body.note?.trim() || null,
        }),
      );
    }
    return ids;
  });

  res.status(201).json({
    success: true,
    message: orderIds.length > 1 ? `Đã đặt ${orderIds.length} đơn hàng` : 'Đặt hàng thành công',
    data: { orderIds },
  });
}

/**
 * GET /api/orders?role=buyer|seller&status=&page=&limit=  (đăng nhập)
 * meta.counts = số đơn theo trạng thái (theo vai trò đang xem).
 */
export async function listOrders(req, res) {
  const qs = req.query;
  validate(qs, {
    role: [rules.oneOf(['buyer', 'seller'], 'Vai trò không hợp lệ')],
    status: [rules.oneOf(Order.ORDER_STATUSES, 'Trạng thái không hợp lệ')],
  });

  const role = qs.role === 'seller' ? 'seller' : 'buyer';
  const page = toPositiveInt(qs.page, 1);
  const limit = Math.min(toPositiveInt(qs.limit, 10), 48);
  const status = typeof qs.status === 'string' && qs.status ? qs.status : undefined;

  const [{ rows, total }, counts, needAction] = await Promise.all([
    Order.findForUser(req.user.id, role, { status, page, limit }),
    Order.countByStatus(req.user.id, role),
    Order.countNeedAction(req.user.id),
  ]);

  res.json({
    success: true,
    data: rows.map((row) => Order.toOrder(row, req.user.id)),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)), counts, needAction, role },
  });
}

/**
 * GET /api/orders/summary  (đăng nhập)
 * Số đơn cần xử lý -> header hiện chấm đỏ / số trên mục "Đơn hàng" ở mọi trang.
 */
export async function orderSummary(req, res) {
  res.json({ success: true, data: { needAction: await Order.countNeedAction(req.user.id) } });
}

/** Lấy đơn + kiểm tra người xem là người mua, người bán hoặc admin */
async function getVisibleOrder(req) {
  const id = toPositiveInt(req.params.id, null);
  const row = id ? await Order.findById(id) : null;
  const allowed = row && (row.buyer_id === req.user.id || row.seller_id === req.user.id || req.user.role === 'admin');
  if (!allowed) throw HttpError.notFound('Không tìm thấy đơn hàng');
  return row;
}

/** GET /api/orders/:id  (người mua / người bán / admin) */
export async function getOrder(req, res) {
  const row = await getVisibleOrder(req);
  res.json({ success: true, data: Order.toOrder(row, req.user.id) });
}

/**
 * PATCH /api/orders/:id/status  { status }  (người mua / người bán, theo bảng TRANSITIONS)
 * Hoàn thành đơn -> tin chuyển "đã bán" trong cùng transaction.
 */
export async function updateOrderStatus(req, res) {
  const id = toPositiveInt(req.params.id, null);
  const next = req.body?.status;
  validate({ status: next }, { status: [rules.required('Thiếu trạng thái mới'), rules.oneOf(Order.ORDER_STATUSES)] });

  await withTransaction(async (conn) => {
    const order = id ? await Order.lockById(conn, id) : null;
    const role = order?.buyer_id === req.user.id ? 'buyer' : order?.seller_id === req.user.id ? 'seller' : null;
    if (!order || !role) throw HttpError.notFound('Không tìm thấy đơn hàng');

    const allowedRoles = TRANSITIONS[order.status]?.[next];
    if (!allowedRoles) {
      throw HttpError.conflict(
        ['completed', 'cancelled'].includes(order.status)
          ? 'Đơn hàng đã kết thúc, không đổi trạng thái được nữa'
          : 'Không thể chuyển đơn sang trạng thái này',
      );
    }
    if (!allowedRoles.includes(role)) {
      throw HttpError.forbidden(
        role === 'buyer' ? 'Chỉ người bán mới thực hiện được thao tác này' : 'Bạn không có quyền thực hiện thao tác này',
      );
    }

    await Order.updateStatus(conn, order.id, next);
    if (next === 'completed') await Order.markListingSold(conn, order.listing_id);
  });

  const row = await Order.findById(id);
  res.json({ success: true, message: STATUS_MESSAGES[next], data: Order.toOrder(row, req.user.id) });
}
