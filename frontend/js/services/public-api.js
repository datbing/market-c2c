/**
 * Gọi API CÔNG KHAI bên ngoài (khác origin, đều cho phép CORS):
 *  1. Tỉnh/thành Việt Nam: https://provinces.open-api.vn/api/v2/
 *     -> lỗi thì dùng file dự phòng /data/provinces.json
 *  2. Tỷ giá USD:        https://open.er-api.com/v6/latest/USD
 *     -> lỗi thì trả null, giao diện tự ẩn phần quy đổi
 * Cả hai đều cache trong LocalStorage để không gọi lại mỗi lần tải trang.
 */
import { cached } from './storage.js';

const PROVINCES_URL = 'https://provinces.open-api.vn/api/v2/?depth=1';
const PROVINCES_FALLBACK_URL = '/data/provinces.json';
const EXCHANGE_URL = 'https://open.er-api.com/v6/latest/USD';

const PROVINCES_TTL = 7 * 24 * 60 * 60 * 1000; // 7 ngày
const EXCHANGE_TTL = 6 * 60 * 60 * 1000; // 6 giờ
const TIMEOUT_MS = 8000;

/** fetch JSON có giới hạn thời gian chờ (API ngoài có thể chậm) */
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
 * Danh sách tỉnh/thành: [{ code, name }], sắp xếp theo tên.
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
    console.warn('[provinces] API lỗi, dùng file dự phòng:', err.message);
    const provinces = await fetchJson(PROVINCES_FALLBACK_URL);
    return {
      provinces: [...provinces].sort((a, b) => a.name.localeCompare(b.name, 'vi')),
      source: 'fallback',
    };
  }
}

/**
 * Tỷ giá: 1 USD = ? VND. Lỗi thì trả null (không ném lỗi để không làm hỏng trang).
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
    console.warn('[exchange] Không lấy được tỷ giá:', err.message);
    return null;
  }
}
