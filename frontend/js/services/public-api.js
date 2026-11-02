/**
 * Calls to external PUBLIC APIs (different origin, both allow CORS):
 *  1. Vietnamese provinces: https://provinces.open-api.vn/api/v2/
 *     -> on error use the fallback file /data/provinces.json
 *  2. USD exchange rate:    https://open.er-api.com/v6/latest/USD
 *     -> on error return null, the UI hides the conversion
 * Both are cached in LocalStorage so they are not refetched on every page load.
 */
import { cached } from './storage.js';

const PROVINCES_URL = 'https://provinces.open-api.vn/api/v2/?depth=1';
const PROVINCES_FALLBACK_URL = '/data/provinces.json';
const EXCHANGE_URL = 'https://open.er-api.com/v6/latest/USD';

const PROVINCES_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const EXCHANGE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const TIMEOUT_MS = 8000;

/** fetch JSON with a timeout (external APIs can be slow) */
async function fetchJson(url, timeout = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Hết thời gian chờ phản hồi');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** "Thành phố Hồ Chí Minh" -> "Hồ Chí Minh", "Tỉnh Lâm Đồng" -> "Lâm Đồng" */
const shortProvinceName = (name) => name.replace(/^(Thành phố|Tỉnh)\s+/u, '').trim();

/**
 * Province list: [{ code, name }], sorted by name.
 * @returns {Promise<{ provinces: object[], source: 'api'|'fallback' }>}
 */
export async function getProvinces() {
  try {
    const provinces = await cached('provinces', PROVINCES_TTL, async () => {
      const raw = await fetchJson(PROVINCES_URL);
      if (!Array.isArray(raw) || raw.length === 0) throw new Error('Dữ liệu tỉnh thành rỗng');
      return raw
        .map(({ code, name }) => ({ code, name: shortProvinceName(name) }))
        .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    });
    return { provinces, source: 'api' };
  } catch (err) {
    console.warn('[provinces] API failed, using the fallback file:', err.message);
    const provinces = await fetchJson(PROVINCES_FALLBACK_URL);
    return {
      provinces: [...provinces].sort((a, b) => a.name.localeCompare(b.name, 'vi')),
      source: 'fallback',
    };
  }
}

/**
 * Exchange rate: 1 USD = ? VND. Returns null on error (never throws, so the page does not break).
 * @returns {Promise<number|null>}
 */
export async function getUsdRate() {
  try {
    return await cached('usdRate', EXCHANGE_TTL, async () => {
      const json = await fetchJson(EXCHANGE_URL);
      const rate = json?.rates?.VND;
      if (json?.result !== 'success' || !rate) throw new Error('Không có tỷ giá VND');
      return rate;
    });
  } catch (err) {
    console.warn('[exchange] Could not get the exchange rate:', err.message);
    return null;
  }
}
