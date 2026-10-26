/**
 * Orders: checkout, purchases / sales, status changes.
 */
import { api } from './api.js';

/**
 * Checkout: one order per item.
 * @param {number[]} listingIds
 * @param {{ receiverName, receiverPhone, address, province, note }} receiver
 * @returns {Promise<{ orderIds: number[], message: string }>}
 *   409 error: err.errors.items = [{ listingId, title, reason }] -> the items that could not be ordered
 */
export async function createOrders(listingIds, receiver) {
  const { data, message } = await api.post('/api/orders', { listingIds, ...receiver });
  return { orderIds: data.orderIds, message };
}

/**
 * @param {{ role: 'buyer'|'seller', status?: string, page?: number, limit?: number }} filters
 * @returns {Promise<{ data: object[], meta: object }>} meta.counts = number of orders per status
 */
export async function getOrders(filters, signal) {
  const { data, meta } = await api.get('/api/orders', { params: filters, signal });
  return { data, meta };
}

export async function updateOrderStatus(id, status) {
  const { data, message } = await api.patch(`/api/orders/${id}/status`, { status });
  return { order: data, message };
}

/** Orders needing action: { seller, buyer } (the header shows a red dot + number) */
export async function getOrderSummary() {
  const { data } = await api.get('/api/orders/summary');
  return data.needAction;
}
