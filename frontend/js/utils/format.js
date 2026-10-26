/**
 * Định dạng tiền, thời gian, nhãn hiển thị.
 */

const vndFormatter = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

/** 9500000 -> "9.500.000 ₫" */
export const formatVND = (amount) => vndFormatter.format(Number(amount) || 0);

/** Quy đổi VND -> USD theo tỷ giá (1 USD = rate VND): "≈ $361" */
export const formatUSD = (amountVnd, rate) =>
  rate ? `≈ ${usdFormatter.format(Number(amountVnd) / rate)}` : '';

/** Rút gọn số lớn: 1200 -> "1,2K" */
export const formatCompact = (n) =>
  new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

/** Thời gian tương đối: "5 phút trước", "3 ngày trước" */
export function timeAgo(dateInput) {
  const date = new Date(dateInput);
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (Number.isNaN(seconds)) return '';
  if (seconds < 60) return 'Vừa xong';

  // Mảng [số giây của đơn vị, tên đơn vị] từ lớn đến nhỏ
  const units = [
    [31536000, 'năm'],
    [2592000, 'tháng'],
    [604800, 'tuần'],
    [86400, 'ngày'],
    [3600, 'giờ'],
    [60, 'phút'],
  ];
  const [unitSeconds, label] = units.find(([s]) => seconds >= s);
  return `${Math.floor(seconds / unitSeconds)} ${label} trước`;
}

/** Nhãn tình trạng hàng (khớp với ENUM item_condition trong DB) */
export const CONDITION_LABELS = {
  new: 'Mới',
  like_new: 'Như mới',
  used: 'Đã dùng',
};

/** Nhãn kiểu sắp xếp (khớp với whitelist SORTS ở backend) */
export const SORT_LABELS = {
  newest: 'Mới nhất',
  price_asc: 'Giá thấp → cao',
  price_desc: 'Giá cao → thấp',
  popular: 'Xem nhiều',
};

const dateFormatter = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** "2026-10-05T04:07:26Z" -> "05/10/2026" */
export const formatDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : dateFormatter.format(date);
};

/** Nhãn trạng thái tin đăng (khớp ENUM listings.status) */
export const LISTING_STATUS_LABELS = {
  pending: 'Chờ duyệt',
  active: 'Đang bán',
  sold: 'Đã bán',
  hidden: 'Đang ẩn',
  rejected: 'Bị từ chối',
};

/** Nhãn trạng thái đơn hàng (khớp ENUM orders.status) */
export const ORDER_STATUS_LABELS = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  shipping: 'Đang giao',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
};
