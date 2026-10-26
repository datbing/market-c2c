/**
 * ADMIN - USERS: /admin/users?status=&q=&page=
 *  - User table (turns into cards on mobile via CSS), search by name / email / phone
 *  - Lock / unlock accounts (admins and yourself cannot be locked - the server enforces it too)
 */
import { $, $$, debounce } from '../../utils/dom.js';
import { cloneTemplate, fillFields } from '../../utils/template.js';
import { formatDate, timeAgo } from '../../utils/format.js';
import { isAbortError } from '../../services/api.js';
import { getAdminUsers, setUserStatus } from '../../services/admin.js';
import { initAdminShell } from '../../components/admin-shell.js';
import { renderPagination } from '../../components/pagination.js';
import { confirmDialog } from '../../components/confirm-dialog.js';
import { showToast } from '../../components/toast.js';

const PAGE_SIZE = 10;

class AdminUsersPage {
  filters = { status: '', q: '', page: 1 };
  users = new Map();
  controller = null;

  async init() {
    this.me = await initAdminShell();
    if (!this.me) return;
    this.el = {
      tabs: $('#status-tabs'),
      search: $('#admin-search'),
      table: $('#user-table'),
      body: $('#user-rows'),
      empty: $('#admin-empty'),
      error: $('#admin-error'),
      pagination: $('#pagination'),
    };
    const params = new URLSearchParams(window.location.search);
    this.filters = {
      status: ['active', 'locked'].includes(params.get('status')) ? params.get('status') : '',
      q: (params.get('q') ?? '').slice(0, 100),
      page: Math.max(1, Number.parseInt(params.get('page'), 10) || 1),
    };
    this.el.search.value = this.filters.q;
    this.bindEvents();
    this.load();
  }

  setFilters(patch) {
    this.filters = { ...this.filters, page: 1, ...patch };
    const params = new URLSearchParams();
    Object.entries(this.filters).forEach(([k, v]) => {
      if (v && !(k === 'page' && v === 1)) params.set(k, v);
    });
    history.replaceState(null, '', `${window.location.pathname}${params.size ? `?${params}` : ''}`);
    this.load();
  }

  showState(state) {
    this.el.table.hidden = state !== 'list';
    this.el.empty.hidden = state !== 'empty';
    this.el.error.hidden = state !== 'error';
    if (state !== 'list') this.el.pagination.hidden = true;
  }

  async load() {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.el.table.classList.add('is-loading');
    try {
      const { data, meta } = await getAdminUsers({ ...this.filters, limit: PAGE_SIZE }, controller.signal);
      $$('[data-status-tab]', this.el.tabs).forEach((tab) => {
        const status = tab.dataset.statusTab;
        tab.querySelector('[data-tab-count]').textContent = meta.counts[status || 'all'] ?? 0;
        tab.classList.toggle('is-active', status === this.filters.status);
        tab.setAttribute('aria-pressed', String(status === this.filters.status));
      });
      this.users = new Map(data.map((u) => [u.id, u]));
      if (data.length === 0) {
        this.showState('empty');
        return;
      }
      this.el.body.replaceChildren(...data.map((u) => this.createRow(u)));
      this.showState('list');
      renderPagination(this.el.pagination, meta);
    } catch (err) {
      if (isAbortError(err)) return;
      $('#admin-error-message').textContent = err.message;
      this.showState('error');
    } finally {
      if (this.controller === controller) this.el.table.classList.remove('is-loading');
    }
  }

  createRow(user) {
    const row = cloneTemplate('tpl-user-row');
    row.dataset.id = user.id;
    const isAdmin = user.role === 'admin';
    fillFields(row, {
      initial: user.name.trim().charAt(0) || '?',
      name: user.name,
      email: user.email,
      phone: user.phone || '—',
      role: isAdmin ? 'Quản trị viên' : 'Người dùng',
      listings: user.listingCount,
      buys: user.buyCount,
      sold: user.soldCount,
      joined: formatDate(user.createdAt),
      lastLogin: user.lastLoginAt ? timeAgo(user.lastLoginAt) : 'Chưa đăng nhập',
      status: user.status === 'locked' ? 'Đã khóa' : 'Hoạt động',
    });
    row.querySelector('[data-field="role"]').classList.add(isAdmin ? 'badge--order-confirmed' : 'badge--status-hidden');
    row.querySelector('[data-field="status"]').classList.add(
      user.status === 'locked' ? 'badge--status-rejected' : 'badge--status-active',
    );
    row.classList.toggle('is-locked', user.status === 'locked');

    // Admins and yourself: no lock button
    const canToggle = !isAdmin && user.id !== this.me.id;
    row.querySelector('[data-action="lock"]').hidden = !canToggle || user.status === 'locked';
    row.querySelector('[data-action="unlock"]').hidden = !canToggle || user.status !== 'locked';
    row.querySelector('[data-no-action]').hidden = canToggle;
    return row;
  }

  async toggle(user, action, button) {
    const lock = action === 'lock';
    const ok = await confirmDialog(
      lock
        ? {
            title: `Khóa tài khoản ${user.name}?`,
            message: 'Người này sẽ bị đăng xuất ngay, không đăng nhập được và toàn bộ tin đăng bị ẩn khỏi trang công khai.',
            confirmText: 'Khóa tài khoản',
            danger: true,
          }
        : { title: `Mở khóa tài khoản ${user.name}?`, message: 'Người này đăng nhập lại được, tin đăng hiển thị trở lại.', confirmText: 'Mở khóa' },
    );
    if (!ok) return;

    button.disabled = true;
    try {
      showToast(await setUserStatus(user.id, lock ? 'locked' : 'active'), 'success');
      this.load();
    } catch (err) {
      showToast(err.message, 'error');
      button.disabled = false;
    }
  }

  bindEvents() {
    this.el.tabs.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-status-tab]');
      if (tab) this.setFilters({ status: tab.dataset.statusTab });
    });

    const search = debounce(() => this.setFilters({ q: this.el.search.value.trim() }), 400);
    this.el.search.addEventListener('input', search);
    $('#admin-search-form').addEventListener('submit', (e) => {
      e.preventDefault();
      search.cancel();
      this.setFilters({ q: this.el.search.value.trim() });
    });

    this.el.body.addEventListener('click', (e) => {
      const button = e.target.closest('button[data-action]');
      if (!button) return;
      const user = this.users.get(Number(button.closest('[data-id]').dataset.id));
      if (user) this.toggle(user, button.dataset.action, button);
    });

    this.el.pagination.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-page]');
      if (btn && !btn.disabled) this.setFilters({ page: Number(btn.dataset.page) });
    });

    $('#admin-retry').addEventListener('click', () => this.load());
  }
}

new AdminUsersPage().init();
