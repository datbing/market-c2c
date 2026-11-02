/**
 * Listing card. The HTML structure lives in the page's <template id="tpl-listing-card">
 * and <template id="tpl-listing-skeleton">; this file only fills in the data.
 */
import { assetUrl } from '../config.js';
import { cloneTemplate, fillFields } from '../utils/template.js';
import { formatVND, formatUSD, timeAgo, CONDITION_LABELS } from '../utils/format.js';

/** Link to the listing detail page */
export const listingUrl = (id) => `/product?id=${encodeURIComponent(id)}`;

/**
 * Create a listing card element.
 * @param {object} listing  Data from the API (or a LocalStorage snapshot)
 * @param {object} [options]
 * @param {boolean} [options.isFavorite]
 * @param {number|null} [options.usdRate]  When an exchange rate is given, show the USD price
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

  // Image: show the <img> if there is one, otherwise the category icon
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

  // Condition badge: the badge--new / badge--like_new / badge--used classes already exist in the CSS
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
 * Update the heart button. The empty/filled heart icon is switched by CSS based on aria-pressed.
 */
export function setFavoriteButton(button, active) {
  button.setAttribute('aria-pressed', String(active));
  button.setAttribute('aria-label', active ? 'Bỏ yêu thích' : 'Thêm vào yêu thích');
}

/** Update the USD price of cards already rendered (when the rate arrives after the list) */
export function applyUsdRate(root, rate) {
  root.querySelectorAll('[data-usd]').forEach((el) => {
    el.textContent = formatUSD(el.dataset.usd, rate);
  });
}

/** N skeleton cards while loading */
export function createSkeletonCards(count = 8) {
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < count; i += 1) fragment.append(cloneTemplate('tpl-listing-skeleton'));
  return fragment;
}
