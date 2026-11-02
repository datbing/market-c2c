/**
 * Listing reports (sent by users, handled by admins in the admin area).
 */
import { api } from './api.js';

/** Send a report. 409 = this listing was already reported and is still pending */
export async function createReport(listingId, reason) {
  const { message } = await api.post('/api/reports', { listingId, reason });
  return message;
}
