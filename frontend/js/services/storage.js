/**
 * LocalStorage / SessionStorage wrapper:
 *  - Adds the "mc2c:" prefix to every key
 *  - JSON.stringify / JSON.parse with try/catch (blocked storage, quota exceeded,
 *    hand-edited broken JSON... none of them crash the page)
 *  - Cache with an expiry (TTL) for API data
 *  - ListStore class for lists: cart, favorites, recently viewed, search history
 */

export const PREFIX = 'mc2c:';

/** Create get/set/remove helpers for one storage area (localStorage or sessionStorage) */
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
        console.warn(`[storage] Could not save "${key}":`, err.message);
        return false;
      }
    },

    remove(key) {
      try {
        getArea().removeItem(PREFIX + key);
      } catch {
        /* ignore */
      }
    },
  };
}

export const local = createStore(() => window.localStorage);
export const session = createStore(() => window.sessionStorage);

// ---------------------------------------------------------
//  API cache with TTL: stores { value, expiresAt } under the key "cache:<name>"
// ---------------------------------------------------------

/**
 * Read the cache. Returns null when expired, unless `allowExpired` = true
 * (used as a fallback when the API call fails).
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
 * Get data with a "cache first, network second" strategy:
 *  1. Cache still valid -> return it, no network call
 *  2. Expired -> call `loader()`, save the new cache on success
 *  3. Call failed -> use the old cache (even if expired) if any, otherwise throw
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
      console.warn(`[cache] "${name}" network error, using stale data:`, err.message);
      return stale;
    }
    throw err;
  }
}

// ---------------------------------------------------------
//  ListStore: a list stored in LocalStorage; every change
//  dispatches a CustomEvent so other modules (header, pages...) can update.
// ---------------------------------------------------------
export class ListStore {
  /**
   * @param {string} key      Key name (without prefix)
   * @param {object} options
   * @param {string} options.event  CustomEvent name dispatched on window when it changes
   * @param {number} [options.max]  Maximum number of items (the oldest are dropped)
   * @param {string|null} [options.idKey] Field used as the key; null = the item itself is the key (string)
   */
  constructor(key, { event, max = Infinity, idKey = 'id' }) {
    this.key = key;
    this.event = event;
    this.max = max;
    this.idKey = idKey;

    // Sync across tabs: another tab changed LocalStorage -> this tab dispatches the event too
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

  /** Always returns an array, even when the stored data is corrupted */
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

  /** Add to the front of the list; if already present, move it to the front (no duplicates) */
  add(item) {
    const id = this.#idOf(item);
    const rest = this.getAll().filter((x) => this.#idOf(x) !== id);
    this.save([item, ...rest]);
  }

  remove(id) {
    this.save(this.getAll().filter((x) => this.#idOf(x) !== id));
  }

  /** Remove if present, add if not. Returns true if the item is in the list afterwards */
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
