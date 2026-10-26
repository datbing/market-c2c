/**
 * Pagination bar. The prev/next buttons are in the HTML (<nav id="pagination">),
 * page number buttons are cloned from <template id="tpl-page-number"> and <template id="tpl-page-gap">.
 * Clicks are handled with event delegation by the page using it (reads data-page).
 */
import { cloneTemplate } from '../utils/template.js';

/**
 * Compute the page numbers to show, collapsed with "…" when there are many pages.
 * Example page 6/20 -> [1, '…', 5, 6, 7, '…', 20]
 */
export function getPageItems(page, totalPages, siblings = 1) {
  const pages = new Set([1, totalPages]);
  for (let p = page - siblings; p <= page + siblings; p += 1) {
    if (p >= 1 && p <= totalPages) pages.add(p);
  }

  const sorted = [...pages].sort((a, b) => a - b);

  // Insert "…" where pages are skipped
  return sorted.reduce((items, p, index) => {
    if (index > 0 && p - sorted[index - 1] > 1) items.push('…');
    items.push(p);
    return items;
  }, []);
}

/**
 * Update the pagination bar. Hidden when there is only one page.
 * @param {HTMLElement} nav  the <nav class="pagination"> element
 */
export function renderPagination(nav, { page, totalPages }) {
  nav.hidden = totalPages <= 1;
  if (nav.hidden) return;

  const prev = nav.querySelector('[data-nav="prev"]');
  const next = nav.querySelector('[data-nav="next"]');
  prev.dataset.page = page - 1;
  prev.disabled = page <= 1;
  next.dataset.page = page + 1;
  next.disabled = page >= totalPages;

  const numbers = getPageItems(page, totalPages).map((item) => {
    if (item === '…') return cloneTemplate('tpl-page-gap');

    const btn = cloneTemplate('tpl-page-number');
    btn.textContent = item;
    btn.dataset.page = item;
    btn.setAttribute('aria-label', `Trang ${item}`);
    if (item === page) {
      btn.classList.add('is-current');
      btn.setAttribute('aria-current', 'page');
    }
    return btn;
  });

  nav.querySelector('[data-pages]').replaceChildren(...numbers);
}
