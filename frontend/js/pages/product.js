/**
 * TRANG CHI TIẾT TIN: /product?id=123
 *  - Gọi song song chi tiết tin (API của mình) + tỷ giá USD (API công khai) bằng Promise.all
 *  - Bộ ảnh (components/gallery.js), hộp xem phóng to bằng <dialog>
 *  - Thêm vào giỏ / Mua ngay / Yêu thích (LocalStorage), chia sẻ (Web Share API / Clipboard API)
 *  - Lưu vào "Tin vừa xem" (LocalStorage) -> hiện ở trang chủ
 *  - Tin cùng danh mục (tải sau, lỗi thì ẩn khối, không ảnh hưởng phần chính)
 *  - Các trạng thái: đang tải / không tìm thấy / lỗi mạng / đã bán / chờ duyệt (chủ tin)
 */
import { $ } from '../utils/dom.js';
import { formatVND, formatUSD, timeAgo, formatDate, CONDITION_LABELS } from '../utils/format.js';
import { cart, favorites, recentlyViewed, toListingSnapshot } from '../services/stores.js';
import { getListing, getRelatedListings } from '../services/catalog.js';
import { getUsdRate } from '../services/public-api.js';
import { getCurrentUser, loginUrl } from '../services/auth.js';
import { initHeader } from '../components/header.js';
import { showToast } from '../components/toast.js';
import { Gallery } from '../components/gallery.js';
import { createListingCard, setFavoriteButton } from '../components/listing-card.js';
import { toggleFavorite, watchFavorites } from '../components/favorite.js';

/** Nội dung khung thông báo theo trạng thái tin: [kiểu alert, icon, câu chữ] */
const STATUS_NOTICES = {
  sold: (l) => ['info', 'bi-bag-check', `Món đồ này đã được bán${l.soldAt ? ` ngày ${formatDate(l.soldAt)}` : ''}.`],
  pending: () => ['warning', 'bi-hourglass-split', 'Tin đang chờ quản trị viên duyệt, người khác chưa nhìn thấy tin này.'],
  hidden: () => ['warning', 'bi-eye-slash', 'Bạn đang ẩn tin này, người khác không nhìn thấy.'],
  rejected: (l) => ['error', 'bi-x-octagon', `Tin bị từ chối${l.rejectReason ? `: ${l.rejectReason}` : '.'}`],
};

class ProductPage {
  listing = null;
  usdRate = null;
  /** Thêm vào giỏ hàng / mua được không (đang bán và không phải tin của mình) */
  canBuy = false;
  /** Map id -> tin cùng danh mục (để lưu snapshot khi bấm tim) */
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

    // id phải là số nguyên dương, không thì khỏi gọi API
    if (!/^\d+$/.test(this.id ?? '')) {
      this.showState('not-found');
      return;
    }
    this.load();
  }

  /** 'loading' | 'content' | 'not-found' | 'error' - các khối đều viết sẵn trong HTML */
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
      // Tỷ giá không bao giờ làm hỏng trang: getUsdRate lỗi thì trả null
      const [listing, rate] = await Promise.all([getListing(this.id), getUsdRate()]);
      this.listing = listing;
      this.usdRate = rate;

      this.render();
      this.showState('content');

      if (listing.status === 'active' && !listing.isOwner) {
        recentlyViewed.add(toListingSnapshot(listing));
      }
      this.loadRelated(); // không chờ: khối phụ tải sau
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
  //  HIỂN THỊ
  // =======================================================
  render() {
    const l = this.listing;
    const categoryUrl = `/?category=${encodeURIComponent(l.category.slug)}`;

    // Tiêu đề tab + mô tả cho chia sẻ
    document.title = `${l.title} | Market C2C`;
    $('meta[name="description"]')?.setAttribute('content', l.description.slice(0, 160));

    // Breadcrumb
    const crumbCategory = $('#crumb-category');
    crumbCategory.textContent = l.category.name;
    crumbCategory.href = categoryUrl;
    $('#crumb-title').textContent = l.title;

    // Bộ ảnh
    new Gallery($('#gallery'), {
      images: l.images,
      title: l.title,
      placeholderIcon: l.category.icon ?? 'bi-box-seam',
    });
    $('#sold-ribbon').hidden = l.status !== 'sold';

    // Thông tin chính
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

    // Nút tim dùng chung cơ chế với thẻ tin (data-id ở khối cha, data-action="favorite")
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

  /** Khung thông báo trạng thái (đã bán, chờ duyệt, ẩn, bị từ chối) */
  renderStatus() {
    const box = this.el.status;
    const l = this.listing;
    // Tin đang bán nhưng đã có người đặt (đơn chưa xử lý xong)
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
    // Tin đã bán không sửa được -> ẩn link "Sửa tin"
    const editLink = $('#owner-edit');
    editLink.href = `/sell?edit=${this.listing.id}`;
    editLink.hidden = status === 'sold';
    this.el.buyerActions.hidden = isOwner;
    this.el.buyNow.disabled = !this.canBuy;
    this.el.addToCart.disabled = !this.canBuy;
    this.renderCartButton();
  }

  /** Nút giỏ hàng: chưa có -> "Thêm vào giỏ", đã có -> "Xem giỏ hàng" (CSS đổi chữ theo aria-pressed) */
  renderCartButton() {
    if (!this.listing) return;
    const inCart = cart.has(this.listing.id);
    this.el.addToCart.setAttribute('aria-pressed', String(inCart));
  }

  // =======================================================
  //  TIN CÙNG DANH MỤC
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
      // Khối phụ: lỗi thì ẩn đi, chỉ ghi log
      console.warn('[related] Không tải được tin cùng danh mục:', err.message);
    }
  }

  // =======================================================
  //  HÀNH ĐỘNG
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

  /** Mua ngay: bắt buộc đăng nhập; thêm vào giỏ (nếu chưa có) rồi sang giỏ hàng */
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

  /** Chia sẻ: điện thoại dùng bảng chia sẻ của hệ điều hành, máy tính thì sao chép link */
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
      if (err.name === 'AbortError') return; // người dùng tự đóng bảng chia sẻ
      showToast('Không chia sẻ được, hãy sao chép địa chỉ trên thanh trình duyệt', 'warning');
    }
  }

  bindEvents() {
    this.el.addToCart.addEventListener('click', () => this.addToCart());
    this.el.buyNow.addEventListener('click', () => this.buyNow());
    this.el.share.addEventListener('click', () => this.share());
    this.el.favorite.addEventListener('click', () => toggleFavorite(this.listing));
    $('#product-retry').addEventListener('click', () => this.load());

    // Tim trên các thẻ "tin cùng danh mục" (event delegation)
    this.el.relatedList.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="favorite"]');
      if (!btn) return;
      const item = this.relatedItems?.get(Number(btn.closest('[data-id]').dataset.id));
      if (item) toggleFavorite(item);
    });

    // Giỏ hàng đổi ở tab khác / header -> cập nhật nút
    window.addEventListener('cart:change', () => this.renderCartButton());
  }
}

new ProductPage(new URLSearchParams(window.location.search).get('id')).init();
