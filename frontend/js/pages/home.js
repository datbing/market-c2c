/**
 * TRANG CHỦ
 *  - Tải song song (Promise.allSettled): danh mục (backend), tỉnh thành + tỷ giá (API công khai)
 *  - Danh sách tin: tìm kiếm, lọc (danh mục, khu vực, tình trạng, giá), sắp xếp, phân trang
 *  - Trạng thái bộ lọc lưu SessionStorage + URL (F5 / quay lại trang vẫn giữ)
 *  - Yêu thích (LocalStorage), tin vừa xem (LocalStorage)
 *  - AbortController hủy request cũ khi người dùng đổi bộ lọc liên tục
 */
import { $, $$, escapeHtml, debounce } from '../utils/dom.js';
import { formatVND, formatCompact, CONDITION_LABELS, SORT_LABELS } from '../utils/format.js';
import { session } from '../services/storage.js';
import { favorites, recentlyViewed, toListingSnapshot } from '../services/stores.js';
import { getCategories, getListings } from '../services/catalog.js';
import { getProvinces, getUsdRate } from '../services/public-api.js';
import { isAbortError } from '../services/api.js';
import { initHeader, setSearchValue } from '../components/header.js';
import { showToast } from '../components/toast.js';
import { renderPagination } from '../components/pagination.js';
import {
  renderListingCard,
  renderSkeletonCards,
  applyUsdRate,
  setFavoriteButton,
} from '../components/listing-card.js';

const PAGE_SIZE = 12;
const SESSION_KEY = 'homeFilters';

/** Giá trị mặc định của bộ lọc; key cũng chính là tên query param gửi lên API */
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
  /** Trạng thái bộ lọc hiện tại */
  filters = { ...DEFAULT_FILTERS };
  /** Map slug -> danh mục (để hiện tên trên chip, tiêu đề) */
  categories = new Map();
  /** Map id -> tin đang hiển thị (để lưu snapshot khi bấm yêu thích) */
  listings = new Map();
  usdRate = null;
  /** AbortController của request danh sách đang chạy */
  controller = null;

  constructor() {
    this.el = {
      categoryList: $('#category-list'),
      grid: $('#listing-grid'),
      pagination: $('#pagination'),
      count: $('#result-count'),
      title: $('#results-title'),
      chips: $('#active-filters'),
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
  //  KHỞI TẠO
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

    this.renderSortOptions();
    this.syncForm();
    this.renderChips();
    this.renderRecent();
    this.bindEvents();

    // Danh sách tin tải ngay, không chờ dữ liệu phụ
    this.loadListings();
    this.loadSideData();
  }

  /** Ưu tiên bộ lọc trên URL (link chia sẻ), không có thì lấy từ SessionStorage */
  readInitialFilters() {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = FILTER_KEYS.some((key) => params.has(key));
    const source = fromUrl ? Object.fromEntries(params) : session.get(SESSION_KEY, {});
    return this.sanitize({ ...DEFAULT_FILTERS, ...source });
  }

  /** Chuẩn hóa dữ liệu bộ lọc (dữ liệu từ URL/Storage có thể bị sửa tay) */
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

  /** Dữ liệu phụ gọi song song, cái nào lỗi không ảnh hưởng cái khác */
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

    // getUsdRate không bao giờ reject, lỗi thì trả null
    if (rate.status === 'fulfilled') this.applyRate(rate.value);
  }

  // =======================================================
  //  CẬP NHẬT BỘ LỌC
  // =======================================================
  /**
   * Đổi một phần bộ lọc rồi tải lại danh sách.
   * Đổi bất kỳ điều kiện nào (trừ page) đều quay về trang 1.
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

  /** Lưu bộ lọc vào SessionStorage và URL (chỉ ghi các giá trị khác mặc định) */
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

  /** Đưa giá trị bộ lọc lên các ô trong form */
  syncForm() {
    const { province, condition, minPrice, maxPrice, sort } = this.filters;
    const { form } = this.el;

    if (this.el.province.querySelector(`option[value="${CSS.escape(province)}"]`)) {
      this.el.province.value = province;
    }
    const radio = form.querySelector(`input[name="condition"][value="${CSS.escape(condition)}"]`);
    if (radio) radio.checked = true;

    // Không ghi đè khi người dùng đang gõ trong ô giá
    if (document.activeElement !== this.el.minPrice) this.el.minPrice.value = minPrice;
    if (document.activeElement !== this.el.maxPrice) this.el.maxPrice.value = maxPrice;
    this.el.sort.value = sort;

    $$('[data-min]', this.el.presets).forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.min === minPrice && btn.dataset.max === maxPrice);
    });

    // Số bộ lọc đang áp dụng (hiện trên nút "Bộ lọc" ở mobile)
    const activeCount = [province, condition, minPrice || maxPrice].filter(Boolean).length;
    this.el.filterCount.textContent = activeCount;
    this.el.filterCount.hidden = activeCount === 0;
  }

  // =======================================================
  //  DANH SÁCH TIN
  // =======================================================
  async loadListings() {
    // Hủy request trước (nếu chưa xong) để kết quả cũ không đè kết quả mới
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;

    const { grid, count } = this.el;
    grid.setAttribute('aria-busy', 'true');
    if (grid.querySelector('.listing-card[data-id]')) grid.classList.add('is-loading');
    else grid.innerHTML = renderSkeletonCards(PAGE_SIZE);
    count.textContent = 'Đang tải...';

    try {
      const { data, meta } = await getListings({ ...this.filters, limit: PAGE_SIZE }, controller.signal);

      // Trang lưu trong session vượt quá tổng số trang (vd: tin đã bị bán bớt) -> về trang cuối
      if (meta.total > 0 && this.filters.page > meta.totalPages) {
        this.setFilters({ page: meta.totalPages });
        return;
      }

      this.renderListings(data, meta);
    } catch (err) {
      if (isAbortError(err)) return; // bị hủy chủ động, bỏ qua
      this.renderListingError(err);
    } finally {
      if (this.controller === controller) {
        grid.classList.remove('is-loading');
        grid.setAttribute('aria-busy', 'false');
      }
    }
  }

  renderListings(items, meta) {
    const { grid, pagination, count, title } = this.el;
    this.listings = new Map(items.map((item) => [item.id, item]));

    // Tiêu đề + số kết quả
    const { q, category } = this.filters;
    const categoryName = this.categories.get(category)?.name;
    title.textContent = q ? `Kết quả cho "${q}"` : categoryName ?? 'Tin đăng mới nhất';
    count.textContent =
      meta.total > 0
        ? `${meta.total.toLocaleString('vi-VN')} tin · Trang ${meta.page}/${meta.totalPages}`
        : 'Không có tin phù hợp';

    if (items.length === 0) {
      grid.innerHTML = `
        <div class="state">
          <i class="bi bi-search" aria-hidden="true"></i>
          <p class="state__title">Không tìm thấy tin đăng nào</p>
          <p class="state__text">Thử bỏ bớt bộ lọc, đổi từ khóa khác hoặc tìm không dấu.</p>
          <button type="button" class="btn btn--primary" data-action="reset">Xóa bộ lọc</button>
        </div>`;
      pagination.innerHTML = '';
      return;
    }

    grid.innerHTML = items
      .map((item) =>
        renderListingCard(item, { isFavorite: favorites.has(item.id), usdRate: this.usdRate }),
      )
      .join('');
    pagination.innerHTML = renderPagination(meta);
  }

  renderListingError(err) {
    this.el.count.textContent = 'Không tải được dữ liệu';
    this.el.pagination.innerHTML = '';
    this.el.grid.innerHTML = `
      <div class="state state--error" role="alert">
        <i class="bi bi-wifi-off" aria-hidden="true"></i>
        <p class="state__title">Không tải được danh sách tin</p>
        <p class="state__text">${escapeHtml(err.message)}</p>
        <button type="button" class="btn btn--primary" data-action="retry">
          <i class="bi bi-arrow-clockwise" aria-hidden="true"></i> Thử lại
        </button>
      </div>`;
  }

  // =======================================================
  //  DANH MỤC
  // =======================================================
  renderCategories(categories) {
    this.categories = new Map(categories.map((c) => [c.slug, c]));

    // Thống kê banner bằng reduce
    const totalActive = categories.reduce((sum, c) => sum + c.listingCount, 0);
    $('#stat-listings').textContent = formatCompact(totalActive);
    $('#stat-categories').textContent = categories.length;

    const tile = ({ slug, name, icon, count }) => `
      <li>
        <button type="button" class="category-tile" data-category="${escapeHtml(slug)}"
                aria-pressed="false">
          <span class="category-tile__icon"><i class="bi ${escapeHtml(icon || 'bi-tag')}" aria-hidden="true"></i></span>
          <span class="category-tile__name">${escapeHtml(name)}</span>
          <span class="category-tile__count">${count} tin</span>
        </button>
      </li>`;

    this.el.categoryList.innerHTML = [
      tile({ slug: '', name: 'Tất cả', icon: 'bi-grid-3x3-gap', count: totalActive }),
      ...categories.map((c) => tile({ ...c, count: c.listingCount })),
    ].join('');
    this.el.categoryList.setAttribute('aria-busy', 'false');

    this.highlightCategory();
    this.renderChips(); // chip danh mục cần tên -> vẽ lại
    // Cập nhật tiêu đề nếu danh sách đã về trước danh mục
    const current = this.categories.get(this.filters.category);
    if (current && !this.filters.q) this.el.title.textContent = current.name;
  }

  renderCategoryError(err) {
    this.el.categoryList.setAttribute('aria-busy', 'false');
    this.el.categoryList.innerHTML = `
      <li class="inline-alert" style="grid-column: 1 / -1">
        <i class="bi bi-exclamation-circle" aria-hidden="true"></i>
        Không tải được danh mục: ${escapeHtml(err?.message ?? 'lỗi không xác định')}
        <button type="button" class="link-btn" data-action="retry-categories">Thử lại</button>
      </li>`;
  }

  renderCategorySkeleton() {
    this.el.categoryList.innerHTML = Array.from(
      { length: 9 },
      () => `
        <li>
          <div class="category-tile category-tile--loading" aria-hidden="true">
            <span class="category-tile__icon skeleton"></span>
            <span class="skeleton skeleton--line" style="width: 70%"></span>
          </div>
        </li>`,
    ).join('');
  }

  highlightCategory() {
    $$('[data-category]', this.el.categoryList).forEach((btn) => {
      const active = btn.dataset.category === this.filters.category;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  // =======================================================
  //  TỈNH THÀNH + TỶ GIÁ (API công khai)
  // =======================================================
  renderProvinces({ provinces, source }) {
    const { province: select, provinceHint } = this.el;
    const current = this.filters.province;
    const names = provinces.map((p) => p.name);

    // Nếu bộ lọc cũ có tỉnh không còn trong danh sách thì vẫn giữ lại 1 option
    if (current && !names.includes(current)) names.unshift(current);

    select.innerHTML = [
      '<option value="">Toàn quốc</option>',
      ...names.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`),
    ].join('');
    select.value = current;
    select.disabled = false;

    $('#stat-provinces').textContent = provinces.length;

    provinceHint.hidden = source !== 'fallback';
    provinceHint.textContent = 'Không kết nối được API tỉnh thành, đang dùng danh sách dự phòng.';
  }

  renderProvinceError() {
    const { province: select, provinceHint } = this.el;
    select.innerHTML = '<option value="">Toàn quốc</option>';
    select.disabled = true;
    provinceHint.hidden = false;
    provinceHint.classList.add('form-hint--error');
    provinceHint.textContent = 'Không tải được danh sách tỉnh thành.';
  }

  applyRate(rate) {
    this.usdRate = rate;
    if (!rate) return; // không có tỷ giá -> phần quy đổi tự ẩn (chuỗi rỗng)

    applyUsdRate(this.el.grid, rate);
    applyUsdRate(this.el.recentList, rate);
    this.el.usdRate.hidden = false;
    this.el.usdRate.textContent = `Giá USD tham khảo theo tỷ giá 1 USD = ${formatVND(Math.round(rate))}`;
  }

  // =======================================================
  //  CHIP BỘ LỌC ĐANG ÁP DỤNG
  // =======================================================
  renderChips() {
    const { q, category, province, condition, minPrice, maxPrice } = this.filters;

    const priceLabel = () => {
      if (minPrice && maxPrice) return `${formatVND(minPrice)} – ${formatVND(maxPrice)}`;
      if (minPrice) return `Từ ${formatVND(minPrice)}`;
      return `Đến ${formatVND(maxPrice)}`;
    };

    // Mảng [key cần xóa, nhãn] -> lọc bỏ các bộ lọc trống
    const chips = [
      q && ['q', `Từ khóa: ${q}`],
      category && ['category', this.categories.get(category)?.name ?? category],
      province && ['province', province],
      condition && ['condition', CONDITION_LABELS[condition]],
      (minPrice || maxPrice) && ['price', priceLabel()],
    ].filter(Boolean);

    this.el.chips.hidden = chips.length === 0;
    this.el.chips.innerHTML =
      chips
        .map(
          ([key, label]) => `
        <span class="chip">
          ${escapeHtml(label)}
          <button type="button" class="chip__remove" data-remove="${key}" aria-label="Bỏ lọc ${escapeHtml(label)}">
            <i class="bi bi-x" aria-hidden="true"></i>
          </button>
        </span>`,
        )
        .join('') +
      (chips.length > 1 ? '<button type="button" class="link-btn" data-action="reset">Xóa tất cả</button>' : '');
  }

  // =======================================================
  //  TIN VỪA XEM
  // =======================================================
  renderRecent() {
    const items = recentlyViewed.getAll();
    this.el.recentSection.hidden = items.length === 0;
    this.el.recentList.innerHTML = items
      .map((item) => renderListingCard(item, { isFavorite: favorites.has(item.id), usdRate: this.usdRate }))
      .join('');
  }

  // =======================================================
  //  YÊU THÍCH
  // =======================================================
  toggleFavorite(button) {
    const id = Number(button.closest('[data-id]').dataset.id);
    const listing = this.listings.get(id) ?? recentlyViewed.getAll().find((x) => x.id === id);
    if (!listing) return;

    const active = favorites.toggle(toListingSnapshot(listing));
    showToast(active ? 'Đã thêm vào tin yêu thích' : 'Đã bỏ khỏi tin yêu thích', active ? 'success' : 'info');
    // Sự kiện favorites:change sẽ cập nhật mọi nút tim (cả danh sách chính và tin vừa xem)
  }

  /** Đồng bộ tất cả nút tim với LocalStorage */
  refreshFavoriteButtons() {
    $$('[data-action="favorite"]').forEach((btn) => {
      const id = Number(btn.closest('[data-id]').dataset.id);
      setFavoriteButton(btn, favorites.has(id));
    });
  }

  // =======================================================
  //  NGĂN KÉO BỘ LỌC (mobile/tablet)
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

  renderSortOptions() {
    this.el.sort.innerHTML = Object.entries(SORT_LABELS)
      .map(([value, label]) => `<option value="${value}">${label}</option>`)
      .join('');
  }

  resetFilters() {
    setSearchValue('');
    this.setFilters({ ...DEFAULT_FILTERS });
  }

  // =======================================================
  //  SỰ KIỆN (dùng event delegation cho phần tử render động)
  // =======================================================
  bindEvents() {
    const { form, grid, pagination, chips, categoryList, presets, sort, recentList } = this.el;

    // Danh mục
    categoryList.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="retry-categories"]')) {
        this.renderCategorySkeleton();
        getCategories()
          .then((data) => this.renderCategories(data))
          .catch((err) => this.renderCategoryError(err));
        return;
      }
      const tile = e.target.closest('[data-category]');
      if (!tile) return;
      const slug = tile.dataset.category;
      // Bấm lại danh mục đang chọn -> bỏ chọn
      this.setFilters({ category: slug === this.filters.category ? '' : slug });
    });

    // Select khu vực + radio tình trạng: áp dụng ngay khi đổi
    form.addEventListener('change', (e) => {
      const { name, value } = e.target;
      if (name === 'province' || name === 'condition') this.setFilters({ [name]: value });
    });

    // Ô giá: debounce để không gọi API mỗi phím gõ
    const applyPrice = debounce(() => {
      const min = this.el.minPrice.value.trim();
      const max = this.el.maxPrice.value.trim();
      const invalid = min && max && Number(min) > Number(max);

      this.el.priceError.hidden = !invalid;
      this.el.priceError.textContent = invalid ? 'Giá "từ" phải nhỏ hơn hoặc bằng giá "đến"' : '';
      if (!invalid) this.setFilters({ minPrice: min, maxPrice: max });
    }, 600);
    form.addEventListener('input', (e) => {
      if (e.target === this.el.minPrice || e.target === this.el.maxPrice) applyPrice();
    });

    // Mức giá có sẵn
    presets.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-min]');
      if (!btn) return;
      const isActive = btn.classList.contains('is-active');
      this.el.priceError.hidden = true;
      this.setFilters(
        isActive ? { minPrice: '', maxPrice: '' } : { minPrice: btn.dataset.min, maxPrice: btn.dataset.max },
      );
    });

    // Nút reset của form
    form.addEventListener('reset', (e) => {
      e.preventDefault();
      this.el.priceError.hidden = true;
      this.resetFilters();
    });

    sort.addEventListener('change', () => this.setFilters({ sort: sort.value }));

    // Phân trang
    pagination.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-page]');
      if (!btn || btn.disabled) return;
      this.setFilters({ page: Number(btn.dataset.page) });
      $('#listings').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // Xóa từng chip
    chips.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-remove]');
      if (!btn) return;
      const key = btn.dataset.remove;
      if (key === 'q') setSearchValue('');
      this.setFilters(key === 'price' ? { minPrice: '', maxPrice: '' } : { [key]: '' });
    });

    // Lưới tin: yêu thích, thử lại, xóa bộ lọc
    const onGridClick = (e) => {
      const favBtn = e.target.closest('[data-action="favorite"]');
      if (favBtn) return this.toggleFavorite(favBtn);
      if (e.target.closest('[data-action="retry"]')) return this.loadListings();
      if (e.target.closest('[data-action="reset"]')) return this.resetFilters();
    };
    grid.addEventListener('click', onGridClick);
    recentList.addEventListener('click', onGridClick);
    chips.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="reset"]')) this.resetFilters();
    });

    // Tin vừa xem
    $('#recent-clear').addEventListener('click', () => {
      recentlyViewed.clear();
      showToast('Đã xóa lịch sử xem', 'info');
    });

    // CustomEvent từ stores.js (kể cả khi tab khác thay đổi)
    window.addEventListener('favorites:change', () => this.refreshFavoriteButtons());
    window.addEventListener('recentlyViewed:change', () => this.renderRecent());

    // Ngăn kéo bộ lọc
    this.el.filterToggle.addEventListener('click', () => this.openFilters());
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="close-filters"]')) this.closeFilters();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeFilters();
    });

    // Năm ở footer
    $('#year').textContent = new Date().getFullYear();
  }
}

// Hiện khung skeleton danh mục ngay khi trang mở
const page = new HomePage();
page.renderCategorySkeleton();
page.init();
