/**
 * Header dùng chung cho mọi trang:
 *  - Ô tìm kiếm + dropdown lịch sử tìm kiếm (LocalStorage), điều khiển bằng bàn phím
 *  - Số đếm giỏ hàng / yêu thích (nghe CustomEvent từ stores.js)
 *  - Khu vực tài khoản (gọi /api/auth/me)
 *  - Nút đổi theme sáng/tối (cookie)
 */
import { $, escapeHtml, debounce } from '../utils/dom.js';
import { getCurrentUser, logout } from '../services/auth.js';
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
//  Tài khoản
// ---------------------------------------------------------
function renderGuest(container) {
  container.innerHTML = `
    <a class="account__login" href="/login">Đăng nhập</a>`;
}

function renderUser(container, user) {
  const initial = escapeHtml(user.name.trim().charAt(0) || '?');
  const adminLink =
    user.role === 'admin'
      ? `<li><a class="account-menu__item" href="/admin/"><i class="bi bi-speedometer2"></i> Trang quản trị</a></li>`
      : '';

  container.innerHTML = `
    <details class="account-menu">
      <summary aria-label="Menu tài khoản">
        <span class="avatar" aria-hidden="true">${initial}</span>
        <span class="account-menu__name">${escapeHtml(user.name)}</span>
      </summary>
      <ul class="account-menu__list">
        <li class="account-menu__header">
          <strong>${escapeHtml(user.name)}</strong>${escapeHtml(user.email)}
        </li>
        ${adminLink}
        <li><a class="account-menu__item" href="/my-listings"><i class="bi bi-card-list"></i> Tin đăng của tôi</a></li>
        <li><a class="account-menu__item" href="/orders"><i class="bi bi-receipt"></i> Đơn hàng</a></li>
        <li><a class="account-menu__item" href="/favorites"><i class="bi bi-heart"></i> Tin yêu thích</a></li>
        <li>
          <button type="button" class="account-menu__item account-menu__item--danger" data-action="logout">
            <i class="bi bi-box-arrow-right"></i> Đăng xuất
          </button>
        </li>
      </ul>
    </details>`;
}

async function initAccount() {
  const container = $('#account-area');
  if (!container) return;

  try {
    const user = await getCurrentUser();
    user ? renderUser(container, user) : renderGuest(container);
  } catch {
    renderGuest(container); // lỗi mạng: vẫn cho người dùng bấm đăng nhập
  }

  container.addEventListener('click', async (e) => {
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
    const menu = $('.account-menu[open]', container);
    if (menu && !menu.contains(e.target)) menu.removeAttribute('open');
  });
}

// ---------------------------------------------------------
//  Tìm kiếm + lịch sử
// ---------------------------------------------------------
/** Bỏ dấu để lọc lịch sử: gõ "dien" vẫn gợi ý "điện thoại" */
const normalize = (str) =>
  str.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();

function initSearch({ onSearch, liveSearch }) {
  const form = $('#search-form');
  if (!form) return;
  const input = $('#search-input', form);
  const dropdown = $('#search-history', form);
  let activeIndex = -1; // phần tử đang chọn bằng phím mũi tên

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

    dropdown.innerHTML = `
      <div class="search__dropdown-head">
        <span>Tìm kiếm gần đây</span>
        <button type="button" class="link-btn" data-clear>Xóa tất cả</button>
      </div>
      <ul role="listbox" aria-label="Lịch sử tìm kiếm">
        ${matches
          .map(
            (term, i) => `
          <li class="search__history-item ${i === activeIndex ? 'is-active' : ''}"
              role="option" aria-selected="${i === activeIndex}">
            <button type="button" class="search__history-term" data-term="${escapeHtml(term)}">
              <i class="bi bi-clock-history" aria-hidden="true"></i> ${escapeHtml(term)}
            </button>
            <button type="button" class="toast__close" data-remove="${escapeHtml(term)}"
                    aria-label="Xóa '${escapeHtml(term)}' khỏi lịch sử">
              <i class="bi bi-x" aria-hidden="true"></i>
            </button>
          </li>`,
          )
          .join('')}
      </ul>`;
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
}

/** Đồng bộ ô tìm kiếm khi trang đổi từ khóa bằng cách khác (vd: bấm xóa chip) */
export function setSearchValue(value) {
  const input = $('#search-input');
  if (input) input.value = value;
}
