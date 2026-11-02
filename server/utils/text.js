/**
 * Vietnamese string helpers.
 */

/** Strip Vietnamese diacritics: "Điện thoại" -> "Dien thoai" */
export function removeVietnameseTones(str = '') {
  return String(str)
    .normalize('NFD') // split letters and diacritics into separate characters
    .replace(/[\u0300-\u036f]/g, '') // remove the diacritic characters
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/**
 * Build the search string: no diacritics + lowercase + collapsed whitespace.
 * Stored in the `search_text` column so users typing without diacritics still find matches.
 */
export function toSearchText(...parts) {
  return removeVietnameseTones(parts.filter(Boolean).join(' '))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Build a URL slug: "Điện thoại & Máy tính bảng" -> "dien-thoai-may-tinh-bang" */
export function slugify(str = '') {
  return removeVietnameseTones(str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
