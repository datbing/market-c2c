/**
 * ADMIN - LISTING REVIEW: /admin/listings?status=&q=&page=
 *  - Status tabs with counts (opens "Pending" by default), search by title / seller name / email
 *  - Approve (pending, rejected -> active), reject / take down (reason required, with suggestions)
 *  - Listings with open reports are flagged
 */
import { $, $$, debounce } from '../../utils/dom.js';
import { cloneTemplate, fillFields } from '../../utils/template.js';
import { formatVND, formatDate, timeAgo, LISTING_STATUS_LABELS } from '../../utils/format.js';
import { assetUrl } from '../../config.js';
import { isAbortError } from '../../services/api.js';
import { getAdminListings, reviewListing } from '../../services/admin.js';
import { initAdminShell, refreshAdminBadges } from '../../components/admin-shell.js';
import { renderPagination } from '../../components/pagination.js';
import { promptDialog } from '../../components/prompt-dialog.js';
import { confirmDialog } from '../../components/confirm-dialog.js';
import { showToast } from '../../components/toast.js';
import { listingUrl } from '../../components/listing-card.js';

const PAGE_SIZE = 10;

/** Buttons shown for each listing status (matches REVIEW_ACTIONS on the server) */
const ACTIONS_BY_STATUS = {
  pending: ['approve', 'reject'],
  rejected: ['approve'],
  active: ['takedown'],
  hidden: ['takedown'],
  sold: [],
};

const REJECT_SUGGESTIONS = [
  'Ảnh không rõ ràng hoặc không đúng sản phẩm',
  'Tiêu đề / mô tả chưa đầy đủ',
  'Giá không hợp lý',
  'Hàng cấm kinh doanh',
  'Sai danh mục',
];

class AdminListingsPage {
  filters = { status: 'pending', q: '', page: 1 };
  listings = new Map();
  controller = null;

  async init() {
    if (!(await initAdminShell())) return;
    this.el = {
      tabs: $('#status-tabs'),
      search: $('#admin-search'),
      list: $('#admin-list'),
      empty: $('#admin-empty'),
      error: $('#admin-error'),
      loading: $('#admin-loading'),
      pagination: $('#pagination'),
    };
    this.readFilters();
    this.el.search.value = this.filters.q;
    this.bindEvents();
    this.load();
  }

  readFilters() {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    this.filters = {
      // No status in the URL -> open "Pending"; ?status= (empty) -> "All"
      status: status === null ? 'pending' : status in LISTING_STATUS_LABELS ? status : '',
      q: (params.get('q') ?? '').slice(0, 100),
      page: Math.max(1, Number.parseInt(params.get('page'), 10) || 1),
    };
  }

  setFilters(patch) {
    this.filters = { ...this.filters, page: 1, ...patch };
    const params = new URLSearchParams({ status: this.filters.status });
    if (this.filters.q) params.set('q', this.filters.q);
    if (this.filters.page > 1) params.set('page', this.filters.page);
    history.replaceState(null, '', `${window.location.pathname}?${params}`);
    this.load();
  }

  showState(state) {
    const { list, loading, empty, error, pagination } = this.el;
    loading.hidden = state !== 'loading';
    list.hidden = state !== 'list';
    empty.hidden = state !== 'empty';
    error.hidden = state !== 'error';
    if (state !== 'list') pagination.hidden = true;
  }

  async load() {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    if (this.el.list.hidden) this.showState('loading');
    else this.el.list.classList.add('is-loading');

    try {
      const { data, meta } = await getAdminListings({ ...this.filters, limit: PAGE_SIZE }, controller.signal);
      if (data.length === 0 && this.filters.page > 1) {
        this.setFilters({ page: this.filters.page - 1 });
        return;
      }
      this.renderTabs(meta.counts);
      this.listings = new Map(data.map((l) => [l.id, l]));
      if (data.length === 0) {
        this.showState('empty');
        return;
      }
      this.el.list.replaceChildren(...data.map((l) => this.createRow(l)));
      this.showState('list');
      renderPagination(this.el.pagination, meta);
    } catch (err) {
      if (isAbortError(err)) return;
      $('#admin-error-message').textContent = err.message;
      this.showState('error');
    } finally {
      if (this.controller === controller) this.el.list.classList.remove('is-loading');
    }
  }

  renderTabs(counts) {
    $$('[data-status-tab]', this.el.tabs).forEach((tab) => {
      const status = tab.dataset.statusTab;
      tab.querySelector('[data-tab-count]').textContent = counts[status || 'all'] ?? 0;
      const active = status === this.filters.status;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-pressed', String(active));
    });
  }

  createRow(item) {
    const row = cloneTemplate('tpl-admin-listing');
    row.dataset.id = item.id;
    fillFields(row, {
      title: item.title,
      price: formatVND(item.price),
      status: LISTING_STATUS_LABELS[item.status],
      category: item.category.name,
      seller: item.seller.name,
      email: item.seller.email,
      created: `Đăng ${timeAgo(item.createdAt)}`,
      views: `${item.views} lượt xem`,
      reports: `${item.openReports} báo cáo`,
    });

    row.querySelectorAll('a[data-link="listing"]').forEach((a) => {
      a.href = listingUrl(item.id);
    });
    row.querySelector('[data-field="created"]').title = formatDate(item.createdAt);
    row.querySelector('.badge').classList.add(`badge--status-${item.status}`);
    row.querySelector('[data-field="reports"]').hidden = item.openReports === 0;
    row.querySelector('[data-seller-locked]').hidden = item.seller.status !== 'locked';

    if (item.thumbnail) {
      const img = row.querySelector('img');
      img.src = assetUrl(item.thumbnail);
      img.alt = item.title;
      img.hidden = false;
      row.querySelector('.my-listing__placeholder').hidden = true;
    } else {
      row.querySelector('.my-listing__placeholder .bi').className = `bi ${item.category.icon ?? 'bi-box-seam'}`;
    }

    const note = row.querySelector('.my-listing__note');
    if (item.status === 'rejected' && item.rejectReason) {
      note.textContent = `Lý do: ${item.rejectReason}`;
      note.classList.add('is-error');
      note.hidden = false;
    }

    const allowed = new Set(ACTIONS_BY_STATUS[item.status] ?? []);
    row.querySelectorAll('button[data-action]').forEach((btn) => {
      btn.hidden = !allowed.has(btn.dataset.action);
    });
    return row;
  }

  // =======================================================
  //  APPROVE / REJECT
  // =======================================================
  async act(item, action, button) {
    let reason;
    if (action === 'approve') {
      const ok = await confirmDialog({
        title: 'Duyệt tin này?',
        message: `"${item.title}" sẽ hiển thị công khai trên trang chủ.`,
        confirmText: 'Duyệt tin',
      });
      if (!ok) return;
    } else {
      const takedown = action === 'takedown';
      reason = await promptDialog({
        title: takedown ? 'Gỡ tin đang bán' : 'Từ chối tin',
        message: `Người bán sẽ thấy lý do này. Tin: "${item.title}"`,
        placeholder: 'Nhập lý do...',
        required: true,
        suggestions: REJECT_SUGGESTIONS,
        confirmText: takedown ? 'Gỡ tin' : 'Từ chối',
        danger: true,
      });
      if (reason === null) return;
    }

    button.disabled = true;
    try {
      const message = await reviewListing(item.id, action === 'approve' ? 'approve' : 'reject', reason);
      showToast(message, 'success');
      this.load();
      refreshAdminBadges();
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

    this.el.list.addEventListener('click', (e) => {
      const button = e.target.closest('button[data-action]');
      if (!button) return;
      const item = this.listings.get(Number(button.closest('[data-id]').dataset.id));
      if (item) this.act(item, button.dataset.action, button);
    });

    this.el.pagination.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-page]');
      if (!btn || btn.disabled) return;
      this.setFilters({ page: Number(btn.dataset.page) });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    $('#admin-retry').addEventListener('click', () => this.load());
  }
}

new AdminListingsPage().init();
