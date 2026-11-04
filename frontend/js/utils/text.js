/**
 * Text helpers.
 */

/** Lowercase without Vietnamese diacritics, for accent-insensitive search: "Điện thoại" -> "dien thoai" */
export const normalizeText = (str = '') =>
  String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .trim();
