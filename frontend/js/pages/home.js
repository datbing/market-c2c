/**
 * HOME PAGE
 *  - The HTML of every part lives in index.html (static markup + <template>);
 *    this file only fetches data, clones templates, fills in text and toggles `hidden`.
 *  - Loads in parallel (Promise.allSettled): categories (backend), provinces + exchange rate (public APIs)
 *  - Listing grid: search, filters (category, area, condition, price), sorting, pagination
 *  - Filter state is kept in SessionStorage + the URL (survives F5 / going back)
 *  - Favorites (LocalStorage), recently viewed (LocalStorage)
 *  - AbortController cancels the previous request when the user changes filters quickly
 */
import { $, $$, debounce } from '../utils/dom.js';
import { cloneTemplate, fillFields } from '../utils/template.js';
import { formatVND, formatCompact, CONDITION_LABELS, SORT_LABELS } from '../utils/format.js';
import { session } from '../services/storage.js';
import { favorites, recentlyViewed } from '../services/stores.js';
import { getCategories, getListings } from '../services/catalog.js';
import { getProvinces, getUsdRate } from '../services/public-api.js';
import { isAbortError } from '../services/api.js';
import { initHeader, setSearchValue } from '../components/header.js';
import { showToast } from '../components/toast.js';
import { toggleFavorite, watchFavorites } from '../components/favorite.js';
import { renderPagination } from '../components/pagination.js';
import { createListingCard, createSkeletonCards, applyUsdRate } from '../components/listing-card.js';

const PAGE_SIZE = 12;
const SESSION_KEY = 'homeFilters';

/** Default filter values; the keys are also the query param names sent to the API */
const DEFAULT_FILTERS = Object.freeze({
  q: '',
  category: '',
  province: '',
  condition: '',
  minPrice: '',
  maxPrice: '',
  sort: 'newest',
  page: 1,
});
const FILTER_KEYS = Object.keys(DEFAULT_FILTERS);

class HomePage {
  /** Current filter state */
  filters = { ...DEFAULT_FILTERS };
  /** Map slug -> category (to show names on chips and the title) */
  categories = new Map();
  /** Map id -> listing on screen (to save a snapshot when favoriting) */
  listings = new Map();
  usdRate = null;
  /** AbortController of the running list request */
  controller = null;

  constructor() {
    this.el = {
      categoryList: $('#category-list'),
      categoryError: $('#category-error'),
      results: $('.results'),
      grid: $('#listing-grid'),
      empty: $('#listing-empty'),
      error: $('#listing-error'),
      pagination: $('#pagination'),
      count: $('#result-count'),
      title: $('#results-title'),
      chips: $('#active-filters'),
      chipList: $('#chip-list'),
      chipReset: $('#chip-reset'),
      form: $('#filter-form'),
      province: $('#filter-province'),
      provinceHint: $('#province-hint'),
      minPrice: $('#filter-min'),
      maxPrice: $('#filter-max'),
      priceError: $('#price-error'),
      presets: $('#price-presets'),
      sort: $('#sort-select'),
      filters: $('#filters'),
      backdrop: $('#filters-backdrop'),
      filterToggle: $('#filter-toggle'),
      filterCount: $('#filter-count'),
      recentSection: $('#recent-section'),
      recentList: $('#recent-list'),
      usdRate: $('#usd-rate'),
    };
  }

  // =======================================================
  //  INITIALIZATION
  // =======================================================
  init() {
    this.filters = this.readInitialFilters();

    initHeader({
      liveSearch: true,
      onSearch: (q) => {
        if (q !== this.filters.q) this.setFilters({ q });
      },
    });
    setSearchValue(this.filters.q);

    this.syncForm();
    this.renderChips();
    this.renderRecent();
    this.bindEvents();

    // Load the listings right away, without waiting for the extra data
    this.loadListings();
    this.loadSideData();
  }

  /** Prefer filters from the URL (shared links), otherwise from SessionStorage */
  readInitialFilters() {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = FILTER_KEYS.some((key) => params.has(key));
    const source = fromUrl ? Object.fromEntries(params) : session.get(SESSION_KEY, {});
    return this.sanitize({ ...DEFAULT_FILTERS, ...source });
  }

  /** Normalize filter data (URL/Storage data may have been edited by hand) */
  sanitize(raw) {
    const clean = {};
    for (const key of FILTER_KEYS) clean[key] = String(raw[key] ?? DEFAULT_FILTERS[key]).trim();

    clean.page = Math.max(1, Number.parseInt(clean.page, 10) || 1);
    if (!SORT_LABELS[clean.sort]) clean.sort = DEFAULT_FILTERS.sort;
    if (clean.condition && !CONDITION_LABELS[clean.condition]) clean.condition = '';
    for (const key of ['minPrice', 'maxPrice']) {
      if (clean[key] && !/^\d+$/.test(clean[key])) clean[key] = '';
    }
    return clean;
  }

  /** Extra data loaded in parallel; one failing does not affect the others */
  async loadSideData() {
    const [categories, provinces, rate] = await Promise.allSettled([
      getCategories(),
      getProvinces(),
      getUsdRate(),
    ]);

    if (categories.status === 'fulfilled') this.renderCategories(categories.value);
    else this.renderCategoryError(categories.reason);

    if (provinces.status === 'fulfilled') this.renderProvinces(provinces.value);
    else this.renderProvinceError();

    // getUsdRate never rejects, it returns null on error
    if (rate.status === 'fulfilled') this.applyRate(rate.value);
  }

  // =======================================================
  //  UPDATING FILTERS
  // =======================================================
  /**
   * Change part of the filters and reload the list.
   * Changing any condition (except page) goes back to page 1.
   */
  setFilters(patch) {
    const next = this.sanitize({ ...this.filters, page: 1, ...patch });
    const changed = FILTER_KEYS.some((key) => next[key] !== this.filters[key]);
    if (!changed) return;

    this.filters = next;
    this.persistFilters();
    this.syncForm();
    this.renderChips();
    this.highlightCategory();
    this.loadListings();
  }

  /** Save the filters to SessionStorage and the URL (only non-default values) */
  persistFilters() {
    session.set(SESSION_KEY, this.filters);

    const params = new URLSearchParams();
    FILTER_KEYS.forEach((key) => {
      if (String(this.filters[key]) !== String(DEFAULT_FILTERS[key])) {
        params.set(key, this.filters[key]);
      }
    });
    const query = params.toString();
    history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  }

  /** Push the filter values into the form controls */
  syncForm() {
    const { province, condition, minPrice, maxPrice, sort } = this.filters;
    const { form } = this.el;

    if (this.el.province.querySelector(`option[value="${CSS.escape(province)}"]`)) {
      this.el.province.value = province;
    }
    const radio = form.querySelector(`input[name="condition"][value="${CSS.escape(condition)}"]`);
    if (radio) radio.checked = true;

    // Do not overwrite while the user is typing in a price field
    if (document.activeElement !== this.el.minPrice) this.el.minPrice.value = minPrice;
    if (document.activeElement !== this.el.maxPrice) this.el.maxPrice.value = maxPrice;
    this.el.sort.value = sort;

    $$('[data-min]', this.el.presets).forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.min === minPrice && btn.dataset.max === maxPrice);
    });

    // Number of active filters (shown on the "Filters" button on mobile)
    const activeCount = [province, condition, minPrice || maxPrice].filter(Boolean).length;
    this.el.filterCount.textContent = activeCount;
    this.el.filterCount.hidden = activeCount === 0;
  }

  // =======================================================
  //  LISTING GRID
  // =======================================================
  /**
   * Pick the visible block: 'list' (grid) | 'empty' (no results) | 'error'.
   * Every block is written in the HTML, this only toggles `hidden`.
   */
  showListingState(state) {
    const { grid, empty, error, pagination } = this.el;
    grid.hidden = state !== 'list';
    empty.hidden = state !== 'empty';
    error.hidden = state !== 'error';
    if (state !== 'list') pagination.hidden = true;
  }

  async loadListings() {
    // Cancel the previous request (if still running) so old results do not overwrite new ones
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;

    const { grid, count } = this.el;
    grid.setAttribute('aria-busy', 'true');
    // Existing results -> fade them; none yet -> show skeleton cards
    if (!grid.hidden && grid.querySelector('.listing-card[data-id]')) {
      grid.classList.add('is-loading');
    } else {
      grid.replaceChildren(createSkeletonCards(PAGE_SIZE));
      this.showListingState('list');
    }
    count.textContent = 'Đang tải...';

    try {
      const { data, meta } = await getListings({ ...this.filters, limit: PAGE_SIZE }, controller.signal);

      // The page saved in the session is past the last page (e.g. some listings were sold) -> go to the last page
      if (meta.total > 0 && this.filters.page > meta.totalPages) {
        this.setFilters({ page: meta.totalPages });
        return;
      }

      this.renderListings(data, meta);
    } catch (err) {
      if (isAbortError(err)) return; // cancelled on purpose, ignore
      this.renderListingError(err);
    } finally {
      if (this.controller === controller) {
        grid.classList.remove('is-loading');
        grid.setAttribute('aria-busy', 'false');
      }
    }
  }

  renderListings(items, meta) {
    const { grid, pagination, count } = this.el;
    this.listings = new Map(items.map((item) => [item.id, item]));

    this.renderTitle();
    count.textContent =
      meta.total > 0
        ? `${meta.total.toLocaleString('vi-VN')} tin · Trang ${meta.page}/${meta.totalPages}`
        : 'Không có tin phù hợp';

    if (items.length === 0) {
      this.showListingState('empty');
      return;
    }

    grid.replaceChildren(
      ...items.map((item) =>
        createListingCard(item, { isFavorite: favorites.has(item.id), usdRate: this.usdRate }),
      ),
    );
    this.showListingState('list');
    renderPagination(pagination, meta);
  }

  renderListingError(err) {
    this.el.count.textContent = 'Không tải được dữ liệu';
    $('#listing-error-message').textContent = err.message;
    this.showListingState('error');
  }

  /** Results heading: keyword > category > default */
  renderTitle() {
    const { q, category } = this.filters;
    const categoryName = this.categories.get(category)?.name;
    this.el.title.textContent = q ? `Kết quả cho "${q}"` : categoryName ?? 'Tin đăng mới nhất';
  }

  // =======================================================
  //  CATEGORIES
  // =======================================================
  renderCategories(categories) {
    const { categoryList, categoryError } = this.el;
    this.categories = new Map(categories.map((c) => [c.slug, c]));

    // Totals with reduce
    const totalActive = categories.reduce((sum, c) => sum + c.listingCount, 0);
    $('#stat-listings').textContent = formatCompact(totalActive);
    $('#stat-categories').textContent = categories.length;
    $('#category-all-count').textContent = `${totalActive} tin`;

    // Remove the skeletons + old tiles (when reloading), keep the "All" tile written in the HTML
    $$('[data-skeleton], [data-generated]', categoryList).forEach((li) => li.remove());

    const tiles = categories.map(({ slug, name, icon, listingCount }) => {
      const li = cloneTemplate('tpl-category-tile');
      li.dataset.generated = '';
      fillFields(li, { name, count: `${listingCount} tin` });
      li.querySelector('[data-category]').dataset.category = slug;
      if (icon) li.querySelector('.category-tile__icon .bi').className = `bi ${icon}`;
      return li;
    });
    categoryList.append(...tiles);

    categoryList.setAttribute('aria-busy', 'false');
    categoryError.hidden = true;
    this.highlightCategory();
    this.renderChips(); // category chips need names -> re-render
    this.renderTitle();
  }

  renderCategoryError(err) {
    $$('[data-skeleton]', this.el.categoryList).forEach((li) => {
      li.hidden = true;
    });
    $('#category-error-message').textContent = err?.message ?? 'lỗi không xác định';
    this.el.categoryList.setAttribute('aria-busy', 'false');
    this.el.categoryError.hidden = false;
  }

  async retryCategories() {
    this.el.categoryError.hidden = true;
    $$('[data-skeleton]', this.el.categoryList).forEach((li) => {
      li.hidden = false;
    });
    try {
      this.renderCategories(await getCategories());
    } catch (err) {
      this.renderCategoryError(err);
    }
  }

  highlightCategory() {
    $$('[data-category]', this.el.categoryList).forEach((btn) => {
      const active = btn.dataset.category === this.filters.category;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  // =======================================================
  //  PROVINCES + EXCHANGE RATE (public APIs)
  // =======================================================
  renderProvinces({ provinces, source }) {
    const { province: select, provinceHint } = this.el;
    const current = this.filters.province;
    const names = provinces.map((p) => p.name);

    // If the saved filter has a province no longer in the list, still keep one option for it
    if (current && !names.includes(current)) names.unshift(current);

    // new Option(text, value): creates an <option> with the DOM API, no HTML string needed
    select.replaceChildren(new Option('Toàn quốc', ''), ...names.map((name) => new Option(name, name)));
    select.value = current;
    select.disabled = false;

    $('#stat-provinces').textContent = provinces.length;

    provinceHint.hidden = source !== 'fallback';
    provinceHint.textContent = 'Không kết nối được API tỉnh thành, đang dùng danh sách dự phòng.';
  }

  renderProvinceError() {
    const { province: select, provinceHint } = this.el;
    select.replaceChildren(new Option('Toàn quốc', ''));
    select.disabled = true;
    provinceHint.hidden = false;
    provinceHint.classList.add('form-hint--error');
    provinceHint.textContent = 'Không tải được danh sách tỉnh thành.';
  }

  applyRate(rate) {
    this.usdRate = rate;
    if (!rate) return; // no exchange rate -> the USD part stays empty (CSS hides empty elements)

    applyUsdRate(this.el.grid, rate);
    applyUsdRate(this.el.recentList, rate);
    $('#usd-rate-value').textContent = formatVND(Math.round(rate));
    this.el.usdRate.hidden = false;
  }

  // =======================================================
  //  ACTIVE FILTER CHIPS
  // =======================================================
  renderChips() {
    const { q, category, province, condition, minPrice, maxPrice } = this.filters;

    const priceLabel = () => {
      if (minPrice && maxPrice) return `${formatVND(minPrice)} – ${formatVND(maxPrice)}`;
      if (minPrice) return `Từ ${formatVND(minPrice)}`;
      return `Đến ${formatVND(maxPrice)}`;
    };

    // Array of [key to clear, label] -> drop the empty filters
    const chips = [
      q && ['q', `Từ khóa: ${q}`],
      category && ['category', this.categories.get(category)?.name ?? category],
      province && ['province', province],
      condition && ['condition', CONDITION_LABELS[condition]],
      (minPrice || maxPrice) && ['price', priceLabel()],
    ].filter(Boolean);

    this.el.chipList.replaceChildren(
      ...chips.map(([key, label]) => {
        const chip = cloneTemplate('tpl-chip');
        fillFields(chip, { label });
        const btn = chip.querySelector('[data-remove]');
        btn.dataset.remove = key;
        btn.setAttribute('aria-label', `Bỏ lọc ${label}`);
        return chip;
      }),
    );
    this.el.chips.hidden = chips.length === 0;
    this.el.chipReset.hidden = chips.length < 2;
  }

  // =======================================================
  //  RECENTLY VIEWED
  // =======================================================
  renderRecent() {
    const items = recentlyViewed.getAll();
    this.el.recentSection.hidden = items.length === 0;
    this.el.recentList.replaceChildren(
      ...items.map((item) =>
        createListingCard(item, { isFavorite: favorites.has(item.id), usdRate: this.usdRate }),
      ),
    );
  }

  // =======================================================
  //  FAVORITES
  // =======================================================
  toggleFavorite(button) {
    const id = Number(button.closest('[data-id]').dataset.id);
    const listing = this.listings.get(id) ?? recentlyViewed.getAll().find((x) => x.id === id);
    // The favorites:change event updates every heart button (main grid and recently viewed)
    if (listing) toggleFavorite(listing);
  }

  // =======================================================
  //  FILTER DRAWER (mobile/tablet)
  // =======================================================
  openFilters() {
    this.el.filters.classList.add('is-open');
    this.el.backdrop.hidden = false;
    this.el.filterToggle.setAttribute('aria-expanded', 'true');
    document.body.classList.add('no-scroll');
    this.el.filters.querySelector('select, input')?.focus();
  }

  closeFilters() {
    if (!this.el.filters.classList.contains('is-open')) return;
    this.el.filters.classList.remove('is-open');
    this.el.backdrop.hidden = true;
    this.el.filterToggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('no-scroll');
    this.el.filterToggle.focus();
  }

  resetFilters() {
    setSearchValue('');
    this.el.priceError.hidden = true;
    this.setFilters({ ...DEFAULT_FILTERS });
  }

  // =======================================================
  //  EVENTS (event delegation for elements cloned from templates)
  // =======================================================
  bindEvents() {
    const { form, results, categoryList, presets, sort, recentList } = this.el;

    // Categories
    categoryList.addEventListener('click', (e) => {
      const tile = e.target.closest('[data-category]');
      if (!tile) return;
      const slug = tile.dataset.category;
      // Clicking the selected category again -> deselect it
      this.setFilters({ category: slug === this.filters.category ? '' : slug });
    });
    $('#category-retry').addEventListener('click', () => this.retryCategories());

    // Area select + condition radios: apply immediately on change
    form.addEventListener('change', (e) => {
      const { name, value } = e.target;
      if (name === 'province' || name === 'condition') this.setFilters({ [name]: value });
    });

    // Price fields: debounced so the API is not called on every keystroke
    const applyPrice = debounce(() => {
      const min = this.el.minPrice.value.trim();
      const max = this.el.maxPrice.value.trim();
      const invalid = Boolean(min && max && Number(min) > Number(max));

      this.el.priceError.hidden = !invalid;
      if (!invalid) this.setFilters({ minPrice: min, maxPrice: max });
    }, 600);
    form.addEventListener('input', (e) => {
      if (e.target === this.el.minPrice || e.target === this.el.maxPrice) applyPrice();
    });

    // Preset price ranges
    presets.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-min]');
      if (!btn) return;
      const isActive = btn.classList.contains('is-active');
      this.el.priceError.hidden = true;
      this.setFilters(
        isActive ? { minPrice: '', maxPrice: '' } : { minPrice: btn.dataset.min, maxPrice: btn.dataset.max },
      );
    });

    // Form reset button
    form.addEventListener('reset', (e) => {
      e.preventDefault();
      this.resetFilters();
    });

    sort.addEventListener('change', () => this.setFilters({ sort: sort.value }));

    // One listener for the whole results area: hearts, chips, pagination, retry, clear filters
    results.addEventListener('click', (e) => {
      const target = e.target;

      const favBtn = target.closest('[data-action="favorite"]');
      if (favBtn) return this.toggleFavorite(favBtn);

      const pageBtn = target.closest('[data-page]');
      if (pageBtn && !pageBtn.disabled) {
        this.setFilters({ page: Number(pageBtn.dataset.page) });
        $('#listings').scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      const chipBtn = target.closest('[data-remove]');
      if (chipBtn) {
        const key = chipBtn.dataset.remove;
        if (key === 'q') setSearchValue('');
        this.setFilters(key === 'price' ? { minPrice: '', maxPrice: '' } : { [key]: '' });
        return;
      }

      if (target.closest('[data-action="retry"]')) return this.loadListings();
      if (target.closest('[data-action="reset"]')) return this.resetFilters();
    });

    // Recently viewed
    recentList.addEventListener('click', (e) => {
      const favBtn = e.target.closest('[data-action="favorite"]');
      if (favBtn) this.toggleFavorite(favBtn);
    });
    $('#recent-clear').addEventListener('click', () => {
      recentlyViewed.clear();
      showToast('Đã xóa lịch sử xem', 'info');
    });

    // CustomEvent from stores.js (including changes from other tabs)
    watchFavorites();
    window.addEventListener('recentlyViewed:change', () => this.renderRecent());

    // Filter drawer
    this.el.filterToggle.addEventListener('click', () => this.openFilters());
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="close-filters"]')) this.closeFilters();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeFilters();
    });
  }
}

new HomePage().init();
