/**
 * Users report listings that break the rules. Admins handle them at /api/admin/reports.
 */
import { HttpError } from '../utils/HttpError.js';
import { validate, rules } from '../utils/validate.js';
import * as Listing from '../models/listing.model.js';
import * as Report from '../models/report.model.js';

/**
 * POST /api/reports  { listingId, reason }  (logged in)
 * - Only publicly visible listings can be reported (active / sold)
 * - You cannot report your own listing, nor report again while the previous report is still open
 */
export async function createReport(req, res) {
  const body = req.body ?? {};
  validate(body, {
    listingId: [rules.required('Thiếu tin cần báo cáo'), rules.integer('Tin không hợp lệ')],
    reason: [
      rules.required('Vui lòng nhập lý do báo cáo'),
      rules.minLength(10, 'Lý do tối thiểu 10 ký tự'),
      rules.maxLength(500, 'Lý do tối đa 500 ký tự'),
    ],
  });

  const listingId = Number(body.listingId);
  const listing = await Listing.findDetailById(listingId);
  if (!listing || !['active', 'sold'].includes(listing.status)) throw HttpError.notFound('Không tìm thấy tin đăng');
  if (listing.user_id === req.user.id) throw HttpError.badRequest('Bạn không thể báo cáo tin của chính mình');
  if (await Report.hasOpenReport(listingId, req.user.id)) {
    throw HttpError.conflict('Bạn đã báo cáo tin này, quản trị viên đang xem xét');
  }

  await Report.create({ listingId, reporterId: req.user.id, reason: String(body.reason).trim() });
  res.status(201).json({ success: true, message: 'Đã gửi báo cáo, cảm ơn bạn! Quản trị viên sẽ xem xét sớm.' });
}
