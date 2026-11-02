/**
 * Formatting of money, time and display labels.
 */

const vndFormatter = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

/** 9500000 -> "9.500.000 ₫" */
export const formatVND = (amount) => vndFormatter.format(Number(amount) || 0);

/** Convert VND -> USD with the exchange rate (1 USD = rate VND): "≈ $361" */
export const formatUSD = (amountVnd, rate) =>
  rate ? `≈ ${usdFormatter.format(Number(amountVnd) / rate)}` : '';

/** Compact large numbers: 1200 -> "1,2K" */
export const formatCompact = (n) =>
  new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

/** Relative time: "5 phút trước", "3 ngày trước" */
export function timeAgo(dateInput) {
  const date = new Date(dateInput);
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (Number.isNaN(seconds)) return '';
  if (seconds < 60) return 'Vừa xong';

  // Array of [seconds per unit, unit name] from largest to smallest
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

/** Item condition labels (match the item_condition ENUM in the DB) */
export const CONDITION_LABELS = {
  new: 'Mới',
  like_new: 'Như mới',
  used: 'Đã dùng',
};

/** Sort labels (match the SORTS whitelist in the backend) */
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

/** Listing status labels (match the listings.status ENUM) */
export const LISTING_STATUS_LABELS = {
  pending: 'Chờ duyệt',
  active: 'Đang bán',
  sold: 'Đã bán',
  hidden: 'Đang ẩn',
  rejected: 'Bị từ chối',
};

/** Order status labels (match the orders.status ENUM) */
export const ORDER_STATUS_LABELS = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  shipping: 'Đang giao',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
};
