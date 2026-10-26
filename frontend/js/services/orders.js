/**
 * Đơn hàng: đặt hàng, xem đơn mua / đơn bán, đổi trạng thái.
 */
import { api } from './api.js';

/**
 * Đặt hàng: mỗi món -> 1 đơn.
 * @param {number[]} listingIds
 * @param {{ receiverName, receiverPhone, address, province, note }} receiver
 * @returns {Promise<{ orderIds: number[], message: string }>}
 *   Lỗi 409: err.errors.items = [{ listingId, title, reason }] -> món nào không đặt được
 */
export async function createOrders(listingIds, receiver) {
  const { data, message } = await api.post('/api/orders', { listingIds, ...receiver });
  return { orderIds: data.orderIds, message };
}

/**
 * @param {{ role: 'buyer'|'seller', status?: string, page?: number, limit?: number }} filters
 * @returns {Promise<{ data: object[], meta: object }>} meta.counts = số đơn theo trạng thái
 */
export async function getOrders(filters, signal) {
  const { data, meta } = await api.get('/api/orders', { params: filters, signal });
  return { data, meta };
}

export async function updateOrderStatus(id, status) {
  const { data, message } = await api.patch(`/api/orders/${id}/status`, { status });
  return { order: data, message };
}

/** Số đơn cần xử lý: { seller, buyer } (header hiện chấm đỏ + số) */
export async function getOrderSummary() {
  const { data } = await api.get('/api/orders/summary');
  return data.needAction;
}
