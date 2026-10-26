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

/** Chi tiết 1 tin (kèm ảnh, người bán). Tin không tồn tại -> ApiError status 404 */
export async function getListing(id, signal) {
  const { data } = await api.get(`/api/listings/${encodeURIComponent(id)}`, { signal });
  return data;
}

/** Tin cùng danh mục, bỏ ra tin đang xem */
export async function getRelatedListings({ category, excludeId, limit = 8 }) {
  const { data } = await api.get('/api/listings', {
    params: { category, exclude: excludeId, limit, sort: 'newest' },
  });
  return data;
}

/**
 * Đăng tin mới. Gửi 1 request FormData gồm các trường chữ + file ảnh (theo thứ tự hiển thị).
 * @param {object} fields  { title, categoryId, condition, price, province, description }
 * @param {Blob[]} images
 * @returns {Promise<object>} tin vừa tạo (chi tiết)
 */
export async function createListing(fields, images) {
  const formData = new FormData();
  Object.entries(fields).forEach(([name, value]) => formData.append(name, value));
  images.forEach((blob, i) => {
    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
    formData.append('images', blob, `anh-${i + 1}.${ext}`);
  });

  const { data, message } = await api.post('/api/listings', formData);
  return { listing: data, message };
}
