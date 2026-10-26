/**
 * Frontend configuration.
 *
 * The frontend (https://market-c2c.test, Laragon's Apache) and the backend
 * (https://market-c2c.test:3000, Node/Express) are two separate servers.
 * The API uses the same domain as the page, only the port differs -> the browser treats it
 * as "same site", so the login cookie (SameSite=Lax) is still sent.
 *
 * Both run over HTTPS (sharing Laragon's certificate). An https page must
 * call an https API, otherwise the browser blocks it as "mixed content".
 */
export const API_PORT = 3000;
export const API_BASE = `https://${window.location.hostname}:${API_PORT}`;

/**
 * File path from the backend (e.g. image "/uploads/abc.jpg") -> full URL.
 * Absolute URLs (http...) and temporary previews (blob:, data:) are returned unchanged.
 */
export function assetUrl(path) {
  if (!path) return null;
  if (/^(https?:\/\/|blob:|data:)/.test(path)) return path;
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}
