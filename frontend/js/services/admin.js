/**
 * Admin API calls /api/admin/... (admins only).
 */
import { api } from './api.js';

/** Dashboard statistics */
export async function getAdminStats(days = 14) {
  const { data } = await api.get('/api/admin/stats', { params: { days } });
  return data;
}

// ---------- Listings ----------
export async function getAdminListings(filters, signal) {
  const { data, meta } = await api.get('/api/admin/listings', { params: filters, signal });
  return { data, meta };
}

/** action: 'approve' | 'reject' (reject needs a reason) */
export async function reviewListing(id, action, reason) {
  const { message } = await api.patch(`/api/admin/listings/${id}/review`, { action, reason });
  return message;
}

// ---------- Users ----------
export async function getAdminUsers(filters, signal) {
  const { data, meta } = await api.get('/api/admin/users', { params: filters, signal });
  return { data, meta };
}

export async function setUserStatus(id, status) {
  const { message } = await api.patch(`/api/admin/users/${id}/status`, { status });
  return message;
}

// ---------- Categories ----------
export async function getAdminCategories() {
  const { data } = await api.get('/api/admin/categories');
  return data;
}

export async function saveCategory(id, payload) {
  const { data, message } = id
    ? await api.put(`/api/admin/categories/${id}`, payload)
    : await api.post('/api/admin/categories', payload);
  return { category: data, message };
}

export async function deleteCategory(id) {
  const { message } = await api.delete(`/api/admin/categories/${id}`);
  return message;
}

// ---------- Reports ----------
export async function getAdminReports(filters, signal) {
  const { data, meta } = await api.get('/api/admin/reports', { params: filters, signal });
  return { data, meta };
}

/** action: 'dismiss' | 'resolve' | 'takedown' */
export async function handleReport(id, action, reason) {
  const { message } = await api.patch(`/api/admin/reports/${id}`, { action, reason });
  return message;
}
