/**
 * Lists stored in LocalStorage, shared across the whole site.
 * Each store dispatches its own CustomEvent when it changes, for example:
 *   window.addEventListener('favorites:change', (e) => console.log(e.detail.count));
 */
import { ListStore } from './storage.js';

/** Cart: every C2C listing is a single item, so no quantity is needed */
export const cart = new ListStore('cart', { event: 'cart:change', max: 50 });

/** Favorites: stores a compact "snapshot" of each listing so it can be shown even offline */
export const favorites = new ListStore('favorites', { event: 'favorites:change', max: 100 });

/** Recently viewed (added by the detail page), keeps the 12 most recent listings */
export const recentlyViewed = new ListStore('recentlyViewed', {
  event: 'recentlyViewed:change',
  max: 12,
});

/** Search history: array of strings, keeps the 8 most recent keywords */
export const searchHistory = new ListStore('searchHistory', {
  event: 'searchHistory:change',
  max: 8,
  idKey: null,
});

/**
 * Build a compact snapshot of a listing for the cart / favorites / recently viewed.
 * Accepts API data (thumbnail or images[], category, seller)
 * as well as older snapshots (categoryIcon, sellerId...) -> can be reused many times.
 */
export const toListingSnapshot = (listing) => {
  const { id, title, price, province, condition, category, seller } = listing;
  return {
    id,
    title,
    price,
    thumbnail: listing.thumbnail ?? listing.images?.[0]?.url ?? null,
    province,
    condition,
    categoryIcon: category?.icon ?? listing.categoryIcon ?? null,
    sellerId: seller?.id ?? listing.sellerId ?? null,
    sellerName: seller?.name ?? listing.sellerName ?? null,
    savedAt: Date.now(),
  };
};
