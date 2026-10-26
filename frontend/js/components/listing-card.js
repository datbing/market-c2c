/**
 * Render thẻ tin đăng thành chuỗi HTML (dùng template literal).
 * Mọi dữ liệu người dùng nhập đều qua escapeHtml trước khi chèn.
 */
import { assetUrl } from '../config.js';
import { escapeHtml } from '../utils/dom.js';
import { formatVND, formatUSD, timeAgo, CONDITION_LABELS } from '../utils/format.js';

/** Link tới trang chi tiết tin */
export const listingUrl = (id) => `/product?id=${encodeURIComponent(id)}`;

/**
 * @param {object} listing  Dữ liệu từ API (hoặc snapshot trong LocalStorage)
 * @param {object} [options]
 * @param {boolean} [options.isFavorite]
 * @param {number|null} [options.usdRate]  Có tỷ giá thì hiện giá quy đổi USD
 */
export function renderListingCard(listing, { isFavorite = false, usdRate = null } = {}) {
  const { id, title, price, thumbnail, province, condition, createdAt } = listing;
  const icon = listing.category?.icon ?? listing.categoryIcon ?? 'bi-box-seam';
  const safeTitle = escapeHtml(title);

  const media = thumbnail
    ? `<img src="${escapeHtml(assetUrl(thumbnail))}" alt="${safeTitle}" loading="lazy">`
    : `<span class="listing-card__placeholder"><i class="bi ${escapeHtml(icon)}" aria-hidden="true"></i></span>`;

  const conditionBadge = CONDITION_LABELS[condition]
    ? `<span class="badge badge--${condition} listing-card__condition">${CONDITION_LABELS[condition]}</span>`
    : '';

  return `
    <article class="listing-card" data-id="${id}">
      <div class="listing-card__media">
        ${media}
        ${conditionBadge}
      </div>
      <button type="button"
              class="listing-card__favorite ${isFavorite ? 'is-active' : ''}"
              data-action="favorite"
              aria-pressed="${isFavorite}"
              aria-label="${isFavorite ? 'Bỏ yêu thích' : 'Thêm vào yêu thích'}">
        <i class="bi ${isFavorite ? 'bi-heart-fill' : 'bi-heart'}" aria-hidden="true"></i>
      </button>
      <div class="listing-card__body">
        <h3 class="listing-card__title">
          <a class="listing-card__link" href="${listingUrl(id)}">${safeTitle}</a>
        </h3>
        <p class="listing-card__price">
          <span>${formatVND(price)}</span>
          <span class="listing-card__usd" data-usd="${Number(price) || 0}">${formatUSD(price, usdRate)}</span>
        </p>
        <p class="listing-card__meta">
          <span><i class="bi bi-geo-alt" aria-hidden="true"></i> ${escapeHtml(province ?? '')}</span>
          ${createdAt ? `<time datetime="${escapeHtml(createdAt)}">${timeAgo(createdAt)}</time>` : ''}
        </p>
      </div>
    </article>`;
}

/** Cập nhật giá USD cho các thẻ đã render (khi tỷ giá về sau danh sách) */
export function applyUsdRate(root, rate) {
  root.querySelectorAll('[data-usd]').forEach((el) => {
    el.textContent = formatUSD(el.dataset.usd, rate);
  });
}

/** Cập nhật trạng thái nút tim của một thẻ mà không render lại cả danh sách */
export function setFavoriteButton(button, active) {
  button.classList.toggle('is-active', active);
  button.setAttribute('aria-pressed', String(active));
  button.setAttribute('aria-label', active ? 'Bỏ yêu thích' : 'Thêm vào yêu thích');
  button.querySelector('.bi').className = `bi ${active ? 'bi-heart-fill' : 'bi-heart'}`;
}

/** Khung xám khi đang tải */
export function renderSkeletonCards(count = 8) {
  const card = `
    <div class="listing-card" aria-hidden="true">
      <div class="skeleton skeleton--media"></div>
      <div class="listing-card__body">
        <div class="skeleton skeleton--line"></div>
        <div class="skeleton skeleton--line skeleton--short"></div>
        <div class="skeleton skeleton--line skeleton--short"></div>
      </div>
    </div>`;
  return card.repeat(count);
}
