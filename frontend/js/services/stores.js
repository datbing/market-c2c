/**
 * Các danh sách lưu trong LocalStorage dùng chung toàn site.
 * Mỗi store phát một CustomEvent riêng khi thay đổi, ví dụ:
 *   window.addEventListener('favorites:change', (e) => console.log(e.detail.count));
 */
import { ListStore } from './storage.js';

/** Giỏ hàng: mỗi tin C2C chỉ có 1 món nên không cần số lượng */
export const cart = new ListStore('cart', { event: 'cart:change', max: 50 });

/** Tin yêu thích: lưu "ảnh chụp" gọn của tin để hiện được cả khi offline */
export const favorites = new ListStore('favorites', { event: 'favorites:change', max: 100 });

/** Tin vừa xem (trang chi tiết sẽ thêm vào), giữ 12 tin gần nhất */
export const recentlyViewed = new ListStore('recentlyViewed', {
  event: 'recentlyViewed:change',
  max: 12,
});

/** Lịch sử tìm kiếm: mảng chuỗi, giữ 8 từ khóa gần nhất */
export const searchHistory = new ListStore('searchHistory', {
  event: 'searchHistory:change',
  max: 8,
  idKey: null,
});

/** Tạo snapshot gọn của 1 tin để lưu vào giỏ / yêu thích / đã xem */
export const toListingSnapshot = ({ id, title, price, thumbnail, province, condition, category, categoryIcon }) => ({
  id,
  title,
  price,
  thumbnail,
  province,
  condition,
  categoryIcon: category?.icon ?? categoryIcon ?? null,
  savedAt: Date.now(),
});
