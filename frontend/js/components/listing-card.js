/**
 * Thẻ tin đăng. Cấu trúc HTML nằm trong <template id="tpl-listing-card">
 * và <template id="tpl-listing-skeleton"> của trang; file này chỉ điền dữ liệu.
 */
import { assetUrl } from '../config.js';
import { cloneTemplate, fillFields } from '../utils/template.js';
import { formatVND, formatUSD, timeAgo, CONDITION_LABELS } from '../utils/format.js';

/** Link tới trang chi tiết tin */
export const listingUrl = (id) => `/product?id=${encodeURIComponent(id)}`;

/**
 * Tạo phần tử thẻ tin.
 * @param {object} listing  Dữ liệu từ API (hoặc snapshot trong LocalStorage)
 * @param {object} [options]
 * @param {boolean} [options.isFavorite]
 * @param {number|null} [options.usdRate]  Có tỷ giá thì hiện giá quy đổi USD
 * @returns {HTMLElement}
 */
export function createListingCard(listing, { isFavorite = false, usdRate = null } = {}) {
  const { id, title, price, thumbnail, province, condition, createdAt } = listing;
  const card = cloneTemplate('tpl-listing-card');
  card.dataset.id = id;

  fillFields(card, {
    title,
    price: formatVND(price),
    usd: formatUSD(price, usdRate),
    province: province ?? '',
    time: createdAt ? timeAgo(createdAt) : '',
  });

  card.querySelector('.listing-card__link').href = listingUrl(id);
  card.querySelector('[data-field="usd"]').dataset.usd = Number(price) || 0;

  const time = card.querySelector('[data-field="time"]');
  if (createdAt) time.dateTime = createdAt;

  // Ảnh: có thì hiện <img>, không thì hiện icon danh mục
  if (thumbnail) {
    const img = card.querySelector('.listing-card__img');
    img.src = assetUrl(thumbnail);
    img.alt = title;
    img.hidden = false;
    card.querySelector('.listing-card__placeholder').hidden = true;
  } else {
    const icon = listing.category?.icon ?? listing.categoryIcon;
    if (icon) card.querySelector('.listing-card__placeholder .bi').className = `bi ${icon}`;
  }

  // Nhãn tình trạng: class badge--new / badge--like_new / badge--used đã có sẵn trong CSS
  const badge = card.querySelector('.listing-card__condition');
  if (CONDITION_LABELS[condition]) {
    badge.textContent = CONDITION_LABELS[condition];
    badge.classList.add(`badge--${condition}`);
    badge.hidden = false;
  }

  setFavoriteButton(card.querySelector('[data-action="favorite"]'), isFavorite);
  return card;
}

/**
 * Cập nhật nút tim. Icon tim rỗng/đặc do CSS đổi theo aria-pressed.
 */
export function setFavoriteButton(button, active) {
  button.setAttribute('aria-pressed', String(active));
  button.setAttribute('aria-label', active ? 'Bỏ yêu thích' : 'Thêm vào yêu thích');
}

/** Cập nhật giá USD cho các thẻ đã hiển thị (khi tỷ giá về sau danh sách) */
export function applyUsdRate(root, rate) {
  root.querySelectorAll('[data-usd]').forEach((el) => {
    el.textContent = formatUSD(el.dataset.usd, rate);
  });
}

/** N thẻ skeleton khi đang tải */
export function createSkeletonCards(count = 8) {
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < count; i += 1) fragment.append(cloneTemplate('tpl-listing-skeleton'));
  return fragment;
}
