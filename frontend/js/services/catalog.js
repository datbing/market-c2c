/**
 * Data from our own backend: categories, listings.
 */
import { api } from './api.js';
import { cached } from './storage.js';

const CATEGORY_TTL = 10 * 60 * 1000; // 10 minutes

/** Categories (cached in LocalStorage for 10 minutes since they rarely change) */
export function getCategories() {
  return cached('categories', CATEGORY_TTL, async () => {
    const { data } = await api.get('/api/categories');
    return data;
  });
}

/**
 * Active listings.
 * @param {object} filters  { q, category, province, condition, minPrice, maxPrice, sort, page, limit }
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ data: object[], meta: object }>}
 */
export async function getListings(filters, signal) {
  const { data, meta } = await api.get('/api/listings', { params: filters, signal });
  return { data, meta };
}

/** Listing detail (with images, seller). Missing listing -> ApiError status 404 */
export async function getListing(id, signal) {
  const { data } = await api.get(`/api/listings/${encodeURIComponent(id)}`, { signal });
  return data;
}

/** Listings in the same category, excluding the one being viewed */
export async function getRelatedListings({ category, excludeId, limit = 8 }) {
  const { data } = await api.get('/api/listings', {
    params: { category, exclude: excludeId, limit, sort: 'newest' },
  });
  return data;
}

/**
 * Post a new listing. Sends one FormData request with the text fields + image files (in display order).
 * @param {object} fields  { title, categoryId, condition, price, province, description }
 * @param {Blob[]} images
 * @returns {Promise<object>} the created listing (detail)
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

// ---------------------------------------------------------
//  My listings
// ---------------------------------------------------------

/**
 * Listings of the logged in user.
 * @param {{ status?: string, q?: string, page?: number, limit?: number }} filters
 * @returns {Promise<{ data: object[], meta: object }>} meta.counts = number of listings per status
 */
export async function getMyListings(filters, signal) {
  const { data, meta } = await api.get('/api/me/listings', { params: filters, signal });
  return { data, meta };
}

/** Change a listing's status (sold / hidden / active) */
export async function updateListingStatus(id, status) {
  const { data, message } = await api.patch(`/api/listings/${id}/status`, { status });
  return { listing: data, message };
}

export async function deleteListing(id) {
  const { message } = await api.delete(`/api/listings/${id}`);
  return message;
}

/**
 * Edit a listing. `images` is the list of images in display order:
 *   { existingId: 12 } = keep an existing image, { blob: Blob } = new image.
 * Sent to the server: the new files in "images" + "imageOrder" (JSON) describing the order.
 */
export async function updateListing(id, fields, images) {
  const formData = new FormData();
  Object.entries(fields).forEach(([name, value]) => formData.append(name, value));

  let newIndex = 0;
  const order = images.map((image) => {
    if (image.existingId) return `existing:${image.existingId}`;
    const ext = image.blob.type === 'image/webp' ? 'webp' : 'jpg';
    formData.append('images', image.blob, `anh-moi-${newIndex + 1}.${ext}`);
    return `new:${newIndex++}`;
  });
  formData.append('imageOrder', JSON.stringify(order));

  const { data, message } = await api.put(`/api/listings/${id}`, formData);
  return { listing: data, message };
}
