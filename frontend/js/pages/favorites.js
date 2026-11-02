/**
 * FAVORITES PAGE: /favorites (no login needed - the data lives in LocalStorage)
 *  - Shows saved listings (snapshots), search + sort right in the browser (filter / sort)
 *  - Re-checks every listing with the server (Promise.allSettled): refreshes price / title,
 *    flags sold / unavailable / deleted listings (CSS renders the label from the data-unavailable attribute)
 *  - Unfavoriting removes the card (listens to the 'favorites:change' CustomEvent), clear all asks for confirmation
 */
import { $, debounce } from '../utils/dom.js';
import { favorites, toListingSnapshot } from '../services/stores.js';
import { getListing } from '../services/catalog.js';
import { getUsdRate } from '../services/public-api.js';
import { initHeader } from '../components/header.js';
import { createListingCard } from '../components/listing-card.js';
import { toggleFavorite } from '../components/favorite.js';
import { confirmDialog } from '../components/confirm-dialog.js';
import { showToast } from '../components/toast.js';

/** Strip diacritics for accent-insensitive search: "Điện thoại" -> "dien thoai" */
const normalize = (str = '') =>
  str.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

/** Sort options: comparison functions for Array.prototype.sort */
const SORTERS = {
  recent: (a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0),
  price_asc: (a, b) => a.price - b.price,
  price_desc: (a, b) => b.price - a.price,
};

class FavoritesPage {
  usdRate = null;
  /** id -> reason it cannot be bought ("Đã bán", "Ngừng bán", "Không còn tồn tại") */
  unavailable = new Map();

  constructor() {
    this.el = {
      grid: $('#favorite-grid'),
      empty: $('#favorite-empty'),
      noResult: $('#favorite-no-result'),
      toolbar: $('#favorite-toolbar'),
      search: $('#favorite-search'),
      sort: $('#favorite-sort'),
      count: $('#favorite-count'),
    };
  }

  init() {
    initHeader();
    this.bindEvents();
    this.render();
    // Exchange rate + availability of each listing: do not block rendering
    getUsdRate().then((rate) => {
      this.usdRate = rate;
      this.render();
    });
    this.checkAvailability();
  }

  /** List after keyword filtering + sorting */
  visibleItems() {
    const keyword = normalize(this.el.search.value.trim());
    return favorites
      .getAll()
      .filter((item) => !keyword || normalize(`${item.title} ${item.province ?? ''}`).includes(keyword))
      .sort(SORTERS[this.el.sort.value] ?? SORTERS.recent);
  }

  render() {
    const total = favorites.count();
    const items = this.visibleItems();

    this.el.empty.hidden = total > 0;
    this.el.toolbar.hidden = total === 0;
    this.el.noResult.hidden = total === 0 || items.length > 0;
    this.el.grid.hidden = items.length === 0;
    this.el.count.textContent = total ? `(${total} tin)` : '';

    this.el.grid.replaceChildren(
      ...items.map((item) => {
        const card = createListingCard(item, { isFavorite: true, usdRate: this.usdRate });
        const label = this.unavailable.get(item.id);
        if (label) card.dataset.unavailable = label;
        return card;
      }),
    );
  }

  async checkAvailability() {
    const items = favorites.getAll();
    const results = await Promise.allSettled(items.map((item) => getListing(item.id)));
    const fresh = new Map();

    results.forEach((result, i) => {
      const { id } = items[i];
      if (result.status === 'rejected') {
        if (result.reason?.status === 404) this.unavailable.set(id, 'Không còn tồn tại');
        return;
      }
      const l = result.value;
      fresh.set(id, l);
      if (l.status === 'sold') this.unavailable.set(id, 'Đã bán');
      else if (l.status !== 'active') this.unavailable.set(id, 'Ngừng bán');
      else if (l.reserved) this.unavailable.set(id, 'Đã có người đặt');
    });

    // Refresh the latest price / title / image, keep the saved time
    if (fresh.size > 0) {
      favorites.save(
        favorites.getAll().map((item) =>
          fresh.has(item.id) ? { ...toListingSnapshot(fresh.get(item.id)), savedAt: item.savedAt } : item,
        ),
      );
    }
    this.render();
  }

  bindEvents() {
    this.el.search.addEventListener('input', debounce(() => this.render(), 250));
    // Filtering happens while typing, so Enter does not need to submit the form
    $('#favorite-search-form').addEventListener('submit', (e) => e.preventDefault());
    this.el.sort.addEventListener('change', () => this.render());

    // Unfavorite (event delegation)
    this.el.grid.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="favorite"]');
      if (!btn) return;
      const id = Number(btn.closest('[data-id]').dataset.id);
      const item = favorites.getAll().find((x) => x.id === id);
      if (item) toggleFavorite(item);
    });

    $('#favorite-clear').addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Xóa tất cả tin yêu thích?',
        message: `${favorites.count()} tin sẽ bị bỏ khỏi danh sách yêu thích.`,
        confirmText: 'Xóa tất cả',
        danger: true,
      });
      if (!ok) return;
      favorites.clear();
      showToast('Đã xóa danh sách yêu thích', 'info');
    });

    // List changed (unfavorited here or in another tab) -> re-render
    window.addEventListener('favorites:change', () => this.render());
  }
}

new FavoritesPage().init();
