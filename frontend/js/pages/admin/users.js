/**
 * ADMIN - USERS: /admin/users?status=&q=&page=
 *  - User table (turns into cards on mobile via CSS), search by name / email / phone
 *  - Lock / unlock accounts (admins and yourself cannot be locked - the server enforces it too)
 *  - Tabs, search, pagination, loading states: components/list-page.js
 */
import { cloneTemplate, fillFields } from '../../utils/template.js';
import { formatDate, timeAgo } from '../../utils/format.js';
import { getAdminUsers, setUserStatus } from '../../services/admin.js';
import { initAdminShell } from '../../components/admin-shell.js';
import { confirmDialog } from '../../components/confirm-dialog.js';
import { ListPage } from '../../components/list-page.js';

class AdminUsersPage extends ListPage {
  defaults = { status: '', q: '', page: 1 };

  constructor() {
    super({
      list: '#user-table',
      rows: '#user-rows',
      empty: '#admin-empty',
      error: '#admin-error',
      errorMessage: '#admin-error-message',
      retry: '#admin-retry',
      pagination: '#pagination',
      tabs: '#status-tabs',
      search: '#admin-search',
      searchForm: '#admin-search-form',
    });
  }

  async init() {
    this.me = await initAdminShell();
    if (this.me) this.start();
  }

  parseFilters(params) {
    const status = params.get('status');
    return {
      status: ['active', 'locked'].includes(status) ? status : '',
      q: (params.get('q') ?? '').slice(0, 100),
      page: ListPage.readPage(params),
    };
  }

  fetchPage(params, signal) {
    return getAdminUsers(params, signal);
  }

  createItem(user) {
    const row = cloneTemplate('tpl-user-row');
    row.dataset.id = user.id;
    const isAdmin = user.role === 'admin';
    const locked = user.status === 'locked';
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
      status: locked ? 'Đã khóa' : 'Hoạt động',
    });
    row.querySelector('[data-field="role"]').classList.add(isAdmin ? 'badge--order-confirmed' : 'badge--status-hidden');
    row.querySelector('[data-field="status"]').classList.add(locked ? 'badge--status-rejected' : 'badge--status-active');
    row.classList.toggle('is-locked', locked);

    // Admins and yourself: no lock button
    const canToggle = !isAdmin && user.id !== this.me.id;
    row.querySelector('[data-action="lock"]').hidden = !canToggle || locked;
    row.querySelector('[data-action="unlock"]').hidden = !canToggle || !locked;
    row.querySelector('[data-no-action]').hidden = canToggle;
    return row;
  }

  async handleAction(user, action, button) {
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
    if (ok) this.runTask(button, () => setUserStatus(user.id, lock ? 'locked' : 'active'));
  }
}

new AdminUsersPage().init();
