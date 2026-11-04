/**
 * Header shared by every page. All of the header HTML is written in the .html files,
 * this file only adds behavior:
 *  - Search box + search history dropdown (LocalStorage), keyboard navigation
 *  - Cart / favorites counters (listens to CustomEvents from stores.js)
 *  - Account area: shows the "guest" or "logged in" block (calls /api/auth/me)
 *  - Light/dark theme toggle (cookie)
 */
import { $, $$, debounce } from '../utils/dom.js';
import { cloneTemplate } from '../utils/template.js';
import { normalizeText } from '../utils/text.js';
import { getCurrentUser, logout, loginUrl } from '../services/auth.js';
import { consumeFlash } from '../services/flash.js';
import { getOrderSummary } from '../services/orders.js';
import { cart, favorites, searchHistory } from '../services/stores.js';
import { initThemeToggle } from './theme.js';
import { showToast } from './toast.js';

// ---------------------------------------------------------
//  Icon counters
// ---------------------------------------------------------
function renderCount(name, count) {
  const badge = $(`[data-count="${name}"]`);
  if (!badge) return;
  badge.textContent = count > 99 ? '99+' : count;
  badge.hidden = count === 0;
}

function initCounters() {
  renderCount('cart', cart.count());
  renderCount('favorites', favorites.count());
  window.addEventListener('cart:change', (e) => renderCount('cart', e.detail.count));
  window.addEventListener('favorites:change', (e) => renderCount('favorites', e.detail.count));
}

// ---------------------------------------------------------
//  Account: the #account-guest and #account-user blocks already exist in the HTML
// ---------------------------------------------------------
function showUser(user) {
  const menu = $('#account-user');
  const fields = { name: user.name, email: user.email, initial: user.name.trim().charAt(0) || '?' };

  $$('[data-user]', menu).forEach((el) => {
    el.textContent = fields[el.dataset.user] ?? '';
  });
  // Admin-only item
  $$('[data-role="admin"]', menu).forEach((el) => {
    el.hidden = user.role !== 'admin';
  });

  menu.hidden = false;
  $('#account-guest').hidden = true;
}

function showGuest() {
  const link = $('#account-guest');
  // After logging in, come back to the current page (unless it is the login/register page itself)
  if (!/^\/(login|register)/.test(window.location.pathname)) link.href = loginUrl();
  link.hidden = false;
  $('#account-user').hidden = true;
}

/**
 * Orders needing action: red dot on the avatar + a number on the "Orders" item.
 * Clicking opens the tab that has work (sales first, since sellers should confirm quickly).
 */
export async function showOrderBadge() {
  try {
    const { seller, buyer } = await getOrderSummary();
    const total = seller + buyer;
    $('[data-order-dot]').hidden = total === 0;
    const count = $('[data-order-count]');
    count.textContent = total > 99 ? '99+' : total;
    count.hidden = total === 0;
    if (total > 0) $('#menu-orders').href = `/orders?role=${seller > 0 ? 'seller' : 'buyer'}`;
  } catch {
    /* order counts are optional, the page still works without them */
  }
}

async function initAccount() {
  const area = $('#account-area');
  if (!area) return;

  try {
    const user = await getCurrentUser();
    if (user) {
      showUser(user);
      showOrderBadge();
    } else {
      showGuest();
    }
  } catch {
    showGuest(); // network error: still let the user click login
  }

  area.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-action="logout"]')) return;
    try {
      await logout();
      showToast('Đã đăng xuất', 'success');
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Clicking outside closes the <details> menu
  document.addEventListener('click', (e) => {
    const menu = $('#account-user');
    if (menu.open && !menu.contains(e.target)) menu.open = false;
  });
}

// ---------------------------------------------------------
//  Search + history
// ---------------------------------------------------------
/** Build one history row from <template id="tpl-history-item"> */
function createHistoryItem(term) {
  const item = cloneTemplate('tpl-history-item');
  item.querySelector('[data-term]').dataset.term = term;
  item.querySelector('[data-field="term"]').textContent = term;

  const removeBtn = item.querySelector('[data-remove]');
  removeBtn.dataset.remove = term;
  removeBtn.setAttribute('aria-label', `Xóa "${term}" khỏi lịch sử`);
  return item;
}

function initSearch({ onSearch, liveSearch }) {
  const form = $('#search-form');
  if (!form) return;
  const input = $('#search-input', form);
  const dropdown = $('#search-history', form);
  const list = $('#search-history-list', form);

  // Prefill the keyword from the URL (?q=...)
  input.value = new URLSearchParams(window.location.search).get('q') ?? '';

  const getMatches = () => {
    // Accent-insensitive: typing "dien" still suggests "điện thoại"
    const keyword = normalizeText(input.value);
    return searchHistory.getAll().filter((term) => normalizeText(term).includes(keyword));
  };

  const closeDropdown = () => {
    dropdown.hidden = true;
    input.setAttribute('aria-expanded', 'false');
  };

  const renderDropdown = () => {
    const matches = getMatches();
    if (matches.length === 0) return closeDropdown();

    list.replaceChildren(...matches.map((term) => createHistoryItem(term)));
    dropdown.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };

  /** Run a search (saved to history when it is a real search) */
  const runSearch = (term, { saveHistory = true } = {}) => {
    const keyword = term.trim();
    if (saveHistory && keyword) searchHistory.add(keyword);
    closeDropdown();

    if (onSearch) onSearch(keyword);
    else window.location.href = keyword ? `/?q=${encodeURIComponent(keyword)}` : '/';
  };

  // Live search while typing (only enabled on the home page), 500ms debounce
  const liveHandler = debounce(() => runSearch(input.value, { saveHistory: false }), 500);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    liveHandler.cancel();
    runSearch(input.value);
    input.blur();
  });

  input.addEventListener('focus', renderDropdown);
  input.addEventListener('input', () => {
    renderDropdown();
    if (liveSearch && onSearch) liveHandler();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDropdown();
  });

  // Event delegation for the buttons in the dropdown
  dropdown.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus in the input
  dropdown.addEventListener('click', (e) => {
    const termBtn = e.target.closest('[data-term]');
    const removeBtn = e.target.closest('[data-remove]');

    if (termBtn) {
      input.value = termBtn.dataset.term;
      runSearch(input.value);
    } else if (removeBtn) {
      searchHistory.remove(removeBtn.dataset.remove);
      renderDropdown();
    } else if (e.target.closest('[data-clear]')) {
      searchHistory.clear();
      closeDropdown();
    }
  });

  input.addEventListener('blur', closeDropdown);
}

/**
 * Initialize the header.
 * @param {object} [options]
 * @param {(keyword: string) => void} [options.onSearch] The page handles searching itself (otherwise go to the home page)
 * @param {boolean} [options.liveSearch] Search while typing (debounced)
 */
export function initHeader({ onSearch, liveSearch = false } = {}) {
  initThemeToggle($('#theme-toggle'));
  initCounters();
  initSearch({ onSearch, liveSearch });
  initAccount();

  // Message left by the previous page (e.g. "Đăng nhập thành công")
  const flash = consumeFlash();
  if (flash) showToast(flash.message, flash.type, 4500); // a bit longer since the page just loaded

  // Year in the footer (the footer is shared too)
  const year = $('#year');
  if (year) year.textContent = new Date().getFullYear();
}

/** Sync the search box when the page changes the keyword some other way (e.g. removing a chip) */
export function setSearchValue(value) {
  const input = $('#search-input');
  if (input) input.value = value;
}
