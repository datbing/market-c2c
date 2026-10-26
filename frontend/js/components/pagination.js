/**
 * Thanh phân trang. Nút "trước/sau" có sẵn trong HTML (<nav id="pagination">),
 * nút số trang nhân bản từ <template id="tpl-page-number"> và <template id="tpl-page-gap">.
 * Click được xử lý bằng event delegation ở trang sử dụng (đọc data-page).
 */
import { cloneTemplate } from '../utils/template.js';

/**
 * Tính danh sách số trang cần hiện, rút gọn bằng "…" khi nhiều trang.
 * Ví dụ trang 6/20 -> [1, '…', 5, 6, 7, '…', 20]
 */
export function getPageItems(page, totalPages, siblings = 1) {
  const pages = new Set([1, totalPages]);
  for (let p = page - siblings; p <= page + siblings; p += 1) {
    if (p >= 1 && p <= totalPages) pages.add(p);
  }

  const sorted = [...pages].sort((a, b) => a - b);

  // Chèn "…" vào chỗ bị nhảy cóc
  return sorted.reduce((items, p, index) => {
    if (index > 0 && p - sorted[index - 1] > 1) items.push('…');
    items.push(p);
    return items;
  }, []);
}

/**
 * Cập nhật thanh phân trang. Chỉ có 1 trang thì ẩn đi.
 * @param {HTMLElement} nav  phần tử <nav class="pagination">
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
