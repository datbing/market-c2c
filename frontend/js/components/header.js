/**
 * Header dùng chung cho mọi trang. Toàn bộ HTML của header viết sẵn trong file .html,
 * file này chỉ gắn hành vi:
 *  - Ô tìm kiếm + dropdown lịch sử tìm kiếm (LocalStorage), điều khiển bằng bàn phím
 *  - Số đếm giỏ hàng / yêu thích (nghe CustomEvent từ stores.js)
 *  - Khu vực tài khoản: bật khối "khách" hoặc "đã đăng nhập" (gọi /api/auth/me)
 *  - Nút đổi theme sáng/tối (cookie)
 */
import { $, $$, debounce } from '../utils/dom.js';
import { cloneTemplate } from '../utils/template.js';
import { getCurrentUser, logout, loginUrl } from '../services/auth.js';
import { consumeFlash } from '../services/flash.js';
import { getOrderSummary } from '../services/orders.js';
import { cart, favorites, searchHistory } from '../services/stores.js';
import { initThemeToggle } from './theme.js';
import { showToast } from './toast.js';

// ---------------------------------------------------------
//  Số đếm trên icon
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
//  Tài khoản: 2 khối #account-guest và #account-user có sẵn trong HTML
// ---------------------------------------------------------
function showUser(user) {
  const menu = $('#account-user');
  const fields = { name: user.name, email: user.email, initial: user.name.trim().charAt(0) || '?' };

  $$('[data-user]', menu).forEach((el) => {
    el.textContent = fields[el.dataset.user] ?? '';
  });
  // Mục chỉ dành cho admin
  $$('[data-role="admin"]', menu).forEach((el) => {
    el.hidden = user.role !== 'admin';
  });

  menu.hidden = false;
  $('#account-guest').hidden = true;
}

function showGuest() {
  const link = $('#account-guest');
  // Đăng nhập xong quay lại đúng trang đang xem (trừ khi đang ở chính trang login/register)
  if (!/^\/(login|register)/.test(window.location.pathname)) link.href = loginUrl();
  link.hidden = false;
  $('#account-user').hidden = true;
}

/**
 * Báo đơn cần xử lý: chấm đỏ trên avatar + số ở mục "Đơn hàng".
 * Bấm vào mở thẳng tab đang có việc (ưu tiên đơn bán vì người bán cần xác nhận sớm).
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
    /* không lấy được số đơn thì thôi, không ảnh hưởng trang */
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
    showGuest(); // lỗi mạng: vẫn cho người dùng bấm đăng nhập
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

  // Bấm ra ngoài thì đóng menu <details>
  document.addEventListener('click', (e) => {
    const menu = $('#account-user');
    if (menu.open && !menu.contains(e.target)) menu.open = false;
  });
}

// ---------------------------------------------------------
//  Tìm kiếm + lịch sử
// ---------------------------------------------------------
/** Bỏ dấu để lọc lịch sử: gõ "dien" vẫn gợi ý "điện thoại" */
const normalize = (str) =>
  str.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();

/** Tạo 1 dòng lịch sử từ <template id="tpl-history-item"> */
function createHistoryItem(term, isActive) {
  const item = cloneTemplate('tpl-history-item');
  item.classList.toggle('is-active', isActive);
  item.setAttribute('aria-selected', String(isActive));

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
  let activeIndex = -1; // dòng đang chọn bằng phím mũi tên

  // Điền sẵn từ khóa trên URL (?q=...)
  input.value = new URLSearchParams(window.location.search).get('q') ?? '';

  const getMatches = () => {
    const keyword = normalize(input.value);
    return searchHistory.getAll().filter((term) => normalize(term).includes(keyword));
  };

  const closeDropdown = () => {
    dropdown.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    activeIndex = -1;
  };

  const renderDropdown = () => {
    const matches = getMatches();
    if (matches.length === 0) return closeDropdown();

    list.replaceChildren(...matches.map((term, i) => createHistoryItem(term, i === activeIndex)));
    dropdown.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };

  /** Thực hiện tìm kiếm (lưu lịch sử nếu là tìm chính thức) */
  const runSearch = (term, { saveHistory = true } = {}) => {
    const keyword = term.trim();
    if (saveHistory && keyword) searchHistory.add(keyword);
    closeDropdown();

    if (onSearch) onSearch(keyword);
    else window.location.href = keyword ? `/?q=${encodeURIComponent(keyword)}` : '/';
  };

  // Tìm kiếm trực tiếp khi gõ (chỉ trang chủ bật), debounce 500ms
  const liveHandler = debounce(() => runSearch(input.value, { saveHistory: false }), 500);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    liveHandler.cancel();
    runSearch(input.value);
    input.blur();
  });

  input.addEventListener('focus', renderDropdown);
  input.addEventListener('input', () => {
    activeIndex = -1;
    renderDropdown();
    if (liveSearch && onSearch) liveHandler();
  });

  // Điều hướng dropdown bằng bàn phím
  input.addEventListener('keydown', (e) => {
    const matches = dropdown.hidden ? [] : getMatches();

    if (e.key === 'Escape') return closeDropdown();
    if (matches.length === 0) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      activeIndex = (activeIndex + step + matches.length) % matches.length;
      renderDropdown();
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      input.value = matches[activeIndex];
      liveHandler.cancel();
      runSearch(input.value);
    }
  });

  // Event delegation cho các nút trong dropdown
  dropdown.addEventListener('mousedown', (e) => e.preventDefault()); // giữ focus ở input
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
 * Khởi tạo header.
 * @param {object} [options]
 * @param {(keyword: string) => void} [options.onSearch] Trang tự xử lý tìm kiếm (không thì chuyển về trang chủ)
 * @param {boolean} [options.liveSearch] Tìm ngay khi gõ (debounce)
 */
export function initHeader({ onSearch, liveSearch = false } = {}) {
  initThemeToggle($('#theme-toggle'));
  initCounters();
  initSearch({ onSearch, liveSearch });
  initAccount();

  // Thông báo do trang trước để lại (vd: "Đăng nhập thành công")
  const flash = consumeFlash();
  if (flash) showToast(flash.message, flash.type, 4500); // lâu hơn chút vì trang vừa tải

  // Năm ở footer (footer cũng dùng chung)
  const year = $('#year');
  if (year) year.textContent = new Date().getFullYear();
}

/** Đồng bộ ô tìm kiếm khi trang đổi từ khóa bằng cách khác (vd: bấm xóa chip) */
export function setSearchValue(value) {
  const input = $('#search-input');
  if (input) input.value = value;
}
