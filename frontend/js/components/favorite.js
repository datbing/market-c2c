/**
 * Nút yêu thích (tim) dùng chung cho mọi trang.
 * Dữ liệu lưu ở LocalStorage qua store `favorites`; mỗi lần đổi, store phát
 * CustomEvent 'favorites:change' -> mọi nút tim trên trang tự đồng bộ (kể cả tab khác).
 */
import { favorites, toListingSnapshot } from '../services/stores.js';
import { setFavoriteButton } from './listing-card.js';
import { showToast } from './toast.js';

/**
 * Bật/tắt yêu thích cho 1 tin, hiện thông báo.
 * @param {object} listing  dữ liệu tin (từ API hoặc snapshot)
 * @returns {boolean} true nếu sau thao tác tin đang được yêu thích
 */
export function toggleFavorite(listing) {
  const active = favorites.toggle(toListingSnapshot(listing));
  showToast(active ? 'Đã thêm vào tin yêu thích' : 'Đã bỏ khỏi tin yêu thích', active ? 'success' : 'info');
  return active;
}

/** Đồng bộ mọi nút tim có data-action="favorite" (nằm trong phần tử có data-id) */
export function syncFavoriteButtons(root = document) {
  root.querySelectorAll('[data-action="favorite"]').forEach((btn) => {
    const id = Number(btn.closest('[data-id]')?.dataset.id);
    if (id) setFavoriteButton(btn, favorites.has(id));
  });
}

/** Tự đồng bộ nút tim mỗi khi danh sách yêu thích thay đổi */
export function watchFavorites(root = document) {
  window.addEventListener('favorites:change', () => syncFavoriteButtons(root));
}
