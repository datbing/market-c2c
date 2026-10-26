/**
 * Bọc LocalStorage / SessionStorage:
 *  - Tự thêm prefix "mc2c:" cho mọi key
 *  - Tự JSON.stringify / JSON.parse, có try/catch (trình duyệt chặn storage,
 *    hết dung lượng, dữ liệu bị sửa tay hỏng JSON... đều không làm sập trang)
 *  - Cache có hạn dùng (TTL) cho dữ liệu API
 *  - Class ListStore cho các danh sách: giỏ hàng, yêu thích, đã xem, lịch sử tìm kiếm
 */

export const PREFIX = 'mc2c:';

/** Tạo bộ get/set/remove cho một vùng lưu trữ (localStorage hoặc sessionStorage) */
function createStore(getArea) {
  return {
    get(key, fallback = null) {
      try {
        const raw = getArea().getItem(PREFIX + key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },

    set(key, value) {
      try {
        getArea().setItem(PREFIX + key, JSON.stringify(value));
        return true;
      } catch (err) {
        console.warn(`[storage] Không lưu được "${key}":`, err.message);
        return false;
      }
    },

    remove(key) {
      try {
        getArea().removeItem(PREFIX + key);
      } catch {
        /* bỏ qua */
      }
    },
  };
}

export const local = createStore(() => window.localStorage);
export const session = createStore(() => window.sessionStorage);

// ---------------------------------------------------------
//  Cache API có TTL: lưu { value, expiresAt } dưới key "cache:<tên>"
// ---------------------------------------------------------

/**
 * Đọc cache. Hết hạn thì trả null, trừ khi `allowExpired` = true
 * (dùng làm phương án dự phòng khi gọi API thất bại).
 */
export function getCache(name, { allowExpired = false } = {}) {
  const entry = local.get(`cache:${name}`);
  if (!entry || typeof entry !== 'object' || !('value' in entry)) return null;
  if (!allowExpired && Date.now() > entry.expiresAt) return null;
  return entry.value;
}

export function setCache(name, value, ttlMs) {
  local.set(`cache:${name}`, { value, expiresAt: Date.now() + ttlMs });
}

/**
 * Lấy dữ liệu theo chiến lược "cache trước, mạng sau":
 *  1. Cache còn hạn -> trả luôn, không gọi mạng
 *  2. Hết hạn -> gọi `loader()`, thành công thì lưu cache mới
 *  3. Gọi lỗi -> dùng cache cũ (dù hết hạn) nếu có, không có thì ném lỗi
 */
export async function cached(name, ttlMs, loader) {
  const fresh = getCache(name);
  if (fresh !== null) return fresh;

  try {
    const value = await loader();
    setCache(name, value, ttlMs);
    return value;
  } catch (err) {
    const stale = getCache(name, { allowExpired: true });
    if (stale !== null) {
      console.warn(`[cache] "${name}" lỗi mạng, dùng dữ liệu cũ:`, err.message);
      return stale;
    }
    throw err;
  }
}

// ---------------------------------------------------------
//  ListStore: danh sách lưu trong LocalStorage, mỗi lần đổi
//  sẽ phát CustomEvent để các module khác (header, trang...) cập nhật.
// ---------------------------------------------------------
export class ListStore {
  /**
   * @param {string} key      Tên key (không cần prefix)
   * @param {object} options
   * @param {string} options.event  Tên CustomEvent phát ra trên window khi thay đổi
   * @param {number} [options.max]  Số phần tử tối đa (cũ nhất bị bỏ)
   * @param {string|null} [options.idKey] Trường làm khóa; null = phần tử chính là khóa (chuỗi)
   */
  constructor(key, { event, max = Infinity, idKey = 'id' }) {
    this.key = key;
    this.event = event;
    this.max = max;
    this.idKey = idKey;

    // Đồng bộ giữa các tab: tab khác sửa LocalStorage -> tab này cũng phát sự kiện
    window.addEventListener('storage', (e) => {
      if (e.key === PREFIX + key) this.#emit();
    });
  }

  #idOf(item) {
    return this.idKey ? item?.[this.idKey] : item;
  }

  #emit() {
    const items = this.getAll();
    window.dispatchEvent(new CustomEvent(this.event, { detail: { items, count: items.length } }));
  }

  /** Luôn trả về mảng, kể cả khi dữ liệu trong storage bị hỏng */
  getAll() {
    const value = local.get(this.key, []);
    return Array.isArray(value) ? value : [];
  }

  count() {
    return this.getAll().length;
  }

  has(id) {
    return this.getAll().some((item) => this.#idOf(item) === id);
  }

  save(items) {
    local.set(this.key, items.slice(0, this.max));
    this.#emit();
  }

  /** Thêm lên đầu danh sách, nếu đã có thì đưa lên đầu (không trùng lặp) */
  add(item) {
    const id = this.#idOf(item);
    const rest = this.getAll().filter((x) => this.#idOf(x) !== id);
    this.save([item, ...rest]);
  }

  remove(id) {
    this.save(this.getAll().filter((x) => this.#idOf(x) !== id));
  }

  /** Có rồi thì xóa, chưa có thì thêm. Trả về true nếu sau thao tác phần tử đang có trong list */
  toggle(item) {
    const id = this.#idOf(item);
    if (this.has(id)) {
      this.remove(id);
      return false;
    }
    this.add(item);
    return true;
  }

  clear() {
    this.save([]);
  }
}
