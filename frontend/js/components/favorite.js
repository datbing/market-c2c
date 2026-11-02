/**
 * Favorite (heart) button shared by every page.
 * Data is stored in LocalStorage through the `favorites` store; on every change the store dispatches
 * the 'favorites:change' CustomEvent -> every heart button syncs itself (other tabs included).
 */
import { favorites, toListingSnapshot } from '../services/stores.js';
import { setFavoriteButton } from './listing-card.js';
import { showToast } from './toast.js';

/**
 * Toggle a listing's favorite state and show a notification.
 * @param {object} listing  listing data (from the API or a snapshot)
 * @returns {boolean} true if the listing is a favorite after the toggle
 */
export function toggleFavorite(listing) {
  const active = favorites.toggle(toListingSnapshot(listing));
  showToast(active ? 'Đã thêm vào tin yêu thích' : 'Đã bỏ khỏi tin yêu thích', active ? 'success' : 'info');
  return active;
}

/** Sync every heart button with data-action="favorite" (inside an element with data-id) */
export function syncFavoriteButtons(root = document) {
  root.querySelectorAll('[data-action="favorite"]').forEach((btn) => {
    const id = Number(btn.closest('[data-id]')?.dataset.id);
    if (id) setFavoriteButton(btn, favorites.has(id));
  });
}

/** Keep heart buttons in sync whenever the favorites list changes */
export function watchFavorites(root = document) {
  window.addEventListener('favorites:change', () => syncFavoriteButtons(root));
}
