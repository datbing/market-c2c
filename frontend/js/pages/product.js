/**
 * LISTING DETAIL PAGE: /product?id=123
 *  - Loads the listing (our API) + the USD rate (public API) in parallel with Promise.all
 *  - Image gallery (components/gallery.js), zoom view with <dialog>
 *  - Add to cart / Buy now / Favorite (LocalStorage), share (Web Share API / Clipboard API)
 *  - Saved to "Recently viewed" (LocalStorage) -> shown on the home page
 *  - Listings in the same category (loaded later; on error the block is hidden without affecting the page)
 *  - States: loading / not found / network error / sold / pending (owner)
 *  - Report a listing: <dialog> to pick a reason + description (login required)
 */
import { $ } from '../utils/dom.js';
import { formatVND, formatUSD, timeAgo, formatDate, CONDITION_LABELS } from '../utils/format.js';
import { cart, favorites, recentlyViewed, toListingSnapshot } from '../services/stores.js';
import { getListing, getRelatedListings } from '../services/catalog.js';
import { getUsdRate } from '../services/public-api.js';
import { getCurrentUser, loginUrl } from '../services/auth.js';
import { createReport } from '../services/reports.js';
import { rules } from '../utils/validators.js';
import { FormHandler, initCharCounters } from '../components/form.js';
import { initHeader } from '../components/header.js';
import { showToast } from '../components/toast.js';
import { Gallery } from '../components/gallery.js';
import { createListingCard, setFavoriteButton } from '../components/listing-card.js';
import { toggleFavorite, watchFavorites } from '../components/favorite.js';

/** Status notice content by listing status: [alert type, icon, text] */
const STATUS_NOTICES = {
  sold: (l) => ['info', 'bi-bag-check', `Món đồ này đã được bán${l.soldAt ? ` ngày ${formatDate(l.soldAt)}` : ''}.`],
  pending: () => ['warning', 'bi-hourglass-split', 'Tin đang chờ quản trị viên duyệt, người khác chưa nhìn thấy tin này.'],
  hidden: () => ['warning', 'bi-eye-slash', 'Bạn đang ẩn tin này, người khác không nhìn thấy.'],
  rejected: (l) => ['error', 'bi-x-octagon', `Tin bị từ chối${l.rejectReason ? `: ${l.rejectReason}` : '.'}`],
};

class ProductPage {
  listing = null;
  usdRate = null;
  /** Whether it can be added to the cart / bought (active and not your own listing) */
  canBuy = false;
  /** Map id -> related listing (to save a snapshot when clicking the heart) */
  relatedItems = new Map();

  constructor(id) {
    this.id = id;
    this.el = {
      loading: $('#product-loading'),
      notFound: $('#product-not-found'),
      error: $('#product-error'),
      content: $('#product-content'),
      status: $('#product-status'),
      buyerActions: $('#buyer-actions'),
      ownerNote: $('#owner-note'),
      buyNow: $('#buy-now'),
      addToCart: $('#add-to-cart'),
      favorite: $('#favorite-btn'),
      share: $('#share-btn'),
      related: $('#related-section'),
      relatedList: $('#related-list'),
    };
  }

  init() {
    initHeader();
    watchFavorites();
    this.bindEvents();

    // id must be a positive integer, otherwise do not call the API
    if (!/^\d+$/.test(this.id ?? '')) {
      this.showState('not-found');
      return;
    }
    this.load();
  }

  /** 'loading' | 'content' | 'not-found' | 'error' - every block is written in the HTML */
  showState(state) {
    const { loading, notFound, error, content } = this.el;
    loading.hidden = state !== 'loading';
    notFound.hidden = state !== 'not-found';
    error.hidden = state !== 'error';
    content.hidden = state !== 'content';
    if (state === 'not-found') document.title = 'Không tìm thấy tin đăng | Market C2C';
  }

  async load() {
    this.showState('loading');
    try {
      // The exchange rate never breaks the page: getUsdRate returns null on error
      const [listing, rate] = await Promise.all([getListing(this.id), getUsdRate()]);
      this.listing = listing;
      this.usdRate = rate;

      this.render();
      this.showState('content');

      if (listing.status === 'active' && !listing.isOwner) {
        recentlyViewed.add(toListingSnapshot(listing));
      }
      this.loadRelated(); // no await: the secondary block loads later
    } catch (err) {
      if (err.status === 404) {
        this.showState('not-found');
      } else {
        $('#product-error-message').textContent = err.message;
        this.showState('error');
      }
    }
  }

  // =======================================================
  //  RENDERING
  // =======================================================
  render() {
    const l = this.listing;
    const categoryUrl = `/?category=${encodeURIComponent(l.category.slug)}`;

    // Tab title + description for sharing
    document.title = `${l.title} | Market C2C`;
    $('meta[name="description"]')?.setAttribute('content', l.description.slice(0, 160));

    // Breadcrumb
    const crumbCategory = $('#crumb-category');
    crumbCategory.textContent = l.category.name;
    crumbCategory.href = categoryUrl;
    $('#crumb-title').textContent = l.title;

    // Gallery
    new Gallery($('#gallery'), {
      images: l.images,
      title: l.title,
      placeholderIcon: l.category.icon ?? 'bi-box-seam',
    });
    $('#sold-ribbon').hidden = l.status !== 'sold';

    // Main info
    const condition = $('#product-condition');
    condition.textContent = CONDITION_LABELS[l.condition] ?? '';
    condition.className = `badge badge--${l.condition}`;

    const categoryLink = $('#product-category');
    categoryLink.href = categoryUrl;
    categoryLink.querySelector('.bi').className = `bi ${l.category.icon ?? 'bi-tag'}`;
    categoryLink.querySelector('span').textContent = l.category.name;

    $('#product-title').textContent = l.title;
    $('#product-price').textContent = formatVND(l.price);
    $('#product-usd').textContent = formatUSD(l.price, this.usdRate);
    $('#product-province').textContent = l.province;
    const time = $('#product-time');
    time.textContent = timeAgo(l.createdAt);
    time.dateTime = l.createdAt;
    time.title = formatDate(l.createdAt);
    $('#product-views').textContent = l.views.toLocaleString('vi-VN');
    $('#product-code').textContent = `#${l.id}`;
    $('#product-description').textContent = l.description;

    this.renderSeller();
    this.renderStatus();
    this.renderActions();

    // The heart button uses the same mechanism as listing cards (data-id on the parent, data-action="favorite")
    this.el.content.dataset.id = l.id;
    setFavoriteButton(this.el.favorite, favorites.has(l.id));
  }

  renderSeller() {
    const { seller } = this.listing;
    $('#seller-initial').textContent = seller.name.trim().charAt(0) || '?';
    $('#seller-name').textContent = seller.name;
    $('#seller-province').textContent = seller.province ?? 'Chưa cập nhật khu vực';
    $('#seller-joined').textContent = `Tham gia ${formatDate(seller.joinedAt)}`;
    $('#seller-active').textContent = seller.activeCount;
    $('#seller-sold').textContent = seller.soldCount;
  }

  /** Status notice (sold, pending, hidden, rejected) */
  renderStatus() {
    const box = this.el.status;
    const l = this.listing;
    // Listing is active but already reserved by someone (order still open)
    const reservedNotice =
      l.status === 'active' && l.reserved
        ? l.isOwner
          ? ['warning', 'bi-receipt', 'Tin đang có đơn hàng chờ bạn xử lý (xem ở Đơn hàng → Đơn bán).']
          : ['info', 'bi-hourglass-split', 'Món đồ đang có người đặt. Bạn có thể lưu tin để theo dõi.']
        : null;
    const notice = STATUS_NOTICES[l.status]?.(l) ?? reservedNotice;
    box.hidden = !notice;
    if (!notice) return;

    const [type, icon, message] = notice;
    box.className = `alert alert--${type}`;
    box.querySelector('.bi').className = `bi ${icon}`;
    box.querySelector('[data-alert-message]').textContent = message;
  }

  renderActions() {
    const { isOwner, status } = this.listing;
    this.canBuy = status === 'active' && !isOwner && !this.listing.reserved;

    this.el.ownerNote.hidden = !isOwner;
    $('#report-btn').hidden = isOwner;
    // Sold listings cannot be edited -> hide the "Edit" link
    const editLink = $('#owner-edit');
    editLink.href = `/sell?edit=${this.listing.id}`;
    editLink.hidden = status === 'sold';
    this.el.buyerActions.hidden = isOwner;
    this.el.buyNow.disabled = !this.canBuy;
    this.el.addToCart.disabled = !this.canBuy;
    this.renderCartButton();
  }

  /** Cart button: not in cart -> "Add to cart", already in cart -> "View cart" (CSS swaps the text via aria-pressed) */
  renderCartButton() {
    if (!this.listing) return;
    const inCart = cart.has(this.listing.id);
    this.el.addToCart.setAttribute('aria-pressed', String(inCart));
  }

  // =======================================================
  //  RELATED LISTINGS
  // =======================================================
  async loadRelated() {
    const { related, relatedList } = this.el;
    try {
      const items = await getRelatedListings({
        category: this.listing.category.slug,
        excludeId: this.listing.id,
      });
      if (items.length === 0) return;

      relatedList.replaceChildren(
        ...items.map((item) =>
          createListingCard(item, { isFavorite: favorites.has(item.id), usdRate: this.usdRate }),
        ),
      );
      this.relatedItems = new Map(items.map((item) => [item.id, item]));
      $('#related-more').href = `/?category=${encodeURIComponent(this.listing.category.slug)}`;
      related.hidden = false;
    } catch (err) {
      // Secondary block: hide it on error, just log
      console.warn('[related] Could not load related listings:', err.message);
    }
  }

  // =======================================================
  //  ACTIONS
  // =======================================================
  addToCart() {
    const l = this.listing;
    if (cart.has(l.id)) {
      window.location.href = '/cart';
      return;
    }
    cart.add(toListingSnapshot(l));
    showToast('Đã thêm vào giỏ hàng', 'success');
  }

  /** Buy now: login required; add to the cart (if not there yet) then go to the cart */
  async buyNow() {
    const button = this.el.buyNow;
    button.disabled = true;
    try {
      const user = await getCurrentUser();
      if (!user) {
        window.location.href = loginUrl();
        return;
      }
      if (!cart.has(this.listing.id)) cart.add(toListingSnapshot(this.listing));
      window.location.href = '/cart';
    } catch (err) {
      showToast(err.message, 'error');
      button.disabled = false;
    }
  }

  /** Share: phones use the OS share sheet, desktops copy the link */
  // =======================================================
  //  REPORT A LISTING
  // =======================================================
  async openReport() {
    const user = await getCurrentUser().catch(() => null);
    if (!user) {
      window.location.href = loginUrl();
      return;
    }
    const dialog = $('#report-dialog');
    const form = $('#report-form');
    if (!this.reportForm) {
      initCharCounters(form);
      this.reportForm = new FormHandler(form, {
        schema: {
          type: [rules.required('Vui lòng chọn lý do')],
          // "Other reason" requires a description of at least 10 characters
          detail: [(v, data) => (data.type === 'other' && String(v ?? '').trim().length < 10 ? 'Vui lòng mô tả ít nhất 10 ký tự' : null)],
        },
        alert: $('#report-alert'),
        onSubmit: async ({ type, detail }) => {
          const reason = type === 'other' ? detail : [type, detail].filter(Boolean).join(': ');
          showToast(await createReport(this.listing.id, reason), 'success');
          dialog.close();
        },
      });
      $('#report-cancel').addEventListener('click', () => dialog.close());
    }
    form.reset();
    this.reportForm.showErrors({});
    this.reportForm.hideAlert();
    dialog.showModal();
  }

  async share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: this.listing.title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      showToast('Đã sao chép liên kết tin đăng', 'success');
    } catch (err) {
      if (err.name === 'AbortError') return; // the user closed the share sheet
      showToast('Không chia sẻ được, hãy sao chép địa chỉ trên thanh trình duyệt', 'warning');
    }
  }

  bindEvents() {
    this.el.addToCart.addEventListener('click', () => this.addToCart());
    this.el.buyNow.addEventListener('click', () => this.buyNow());
    this.el.share.addEventListener('click', () => this.share());
    $('#report-btn').addEventListener('click', () => this.openReport());
    this.el.favorite.addEventListener('click', () => toggleFavorite(this.listing));
    $('#product-retry').addEventListener('click', () => this.load());

    // Hearts on the related listing cards (event delegation)
    this.el.relatedList.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="favorite"]');
      if (!btn) return;
      const item = this.relatedItems?.get(Number(btn.closest('[data-id]').dataset.id));
      if (item) toggleFavorite(item);
    });

    // Cart changed in another tab / the header -> update the button
    window.addEventListener('cart:change', () => this.renderCartButton());
  }
}

new ProductPage(new URLSearchParams(window.location.search).get('id')).init();
