/**
 * Render thanh phân trang. Trang hiện tại được click sẽ xử lý bằng
 * event delegation ở trang sử dụng (đọc data-page của nút).
 */

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

/** @returns {string} HTML các nút phân trang ('' nếu chỉ có 1 trang) */
export function renderPagination({ page, totalPages }) {
  if (totalPages <= 1) return '';

  const button = (target, label, { disabled = false, current = false, aria } = {}) => `
    <button type="button" class="pagination__btn ${current ? 'is-current' : ''}"
            data-page="${target}" ${disabled ? 'disabled' : ''}
            ${current ? 'aria-current="page"' : ''}
            ${aria ? `aria-label="${aria}"` : ''}>${label}</button>`;

  const numbers = getPageItems(page, totalPages)
    .map((item) =>
      item === '…'
        ? '<span class="pagination__gap" aria-hidden="true">…</span>'
        : button(item, item, { current: item === page, aria: `Trang ${item}` }),
    )
    .join('');

  return [
    button(page - 1, '<i class="bi bi-chevron-left" aria-hidden="true"></i>', {
      disabled: page <= 1,
      aria: 'Trang trước',
    }),
    numbers,
    button(page + 1, '<i class="bi bi-chevron-right" aria-hidden="true"></i>', {
      disabled: page >= totalPages,
      aria: 'Trang sau',
    }),
  ].join('');
}
