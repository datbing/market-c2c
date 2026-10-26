/**
 * Dữ liệu từ backend của mình: danh mục, tin đăng.
 */
import { api } from './api.js';
import { cached } from './storage.js';

const CATEGORY_TTL = 10 * 60 * 1000; // 10 phút

/** Danh mục (cache LocalStorage 10 phút vì ít thay đổi) */
export function getCategories() {
  return cached('categories', CATEGORY_TTL, async () => {
    const { data } = await api.get('/api/categories');
    return data;
  });
}

/**
 * Danh sách tin đang bán.
 * @param {object} filters  { q, category, province, condition, minPrice, maxPrice, sort, page, limit }
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ data: object[], meta: object }>}
 */
export async function getListings(filters, signal) {
  const { data, meta } = await api.get('/api/listings', { params: filters, signal });
  return { data, meta };
}
