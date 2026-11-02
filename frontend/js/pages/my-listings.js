/**
 * MY LISTINGS PAGE: /my-listings (login required)
 *  - Status tabs with counts (All / Active / Pending / Sold / Hidden / Rejected)
 *  - Search within your own listings (debounced), pagination
 *  - Actions by status: edit, mark as sold, hide, show again, relist, delete
 *    (confirmed with a <dialog> before deleting / marking as sold)
 *  - Filters are kept in the URL (?status=&q=&page=) -> F5 / shared links open the right tab
 */
import { $, $$, debounce } from '../utils/dom.js';
import { cloneTemplate, fillFields } from '../utils/template.js';
import { formatVND, formatDate, timeAgo, LISTING_STATUS_LABELS } from '../utils/format.js';
import { assetUrl } from '../config.js';
import { isAbortError } from '../services/api.js';
import { getCurrentUser, loginUrl } from '../services/auth.js';
import { getMyListings, updateListingStatus, deleteListing } from '../services/catalog.js';
import { initHeader } from '../components/header.js';
import { showToast } from '../components/toast.js';
import { renderPagination } from '../components/pagination.js';
import { confirmDialog } from '../components/confirm-dialog.js';
import { listingUrl } from '../components/listing-card.js';

const PAGE_SIZE = 10;

/**
 * Action buttons shown for each listing status (every button already exists in the template).
 * "delete" also depends on whether the listing already has orders (handled separately).
 */
const ACTIONS_BY_STATUS = {
  active: ['edit', 'sold', 'hide', 'delete'],
  hidden: ['edit', 'show', 'sold', 'delete'],
  sold: ['relist', 'delete'],
  pending: ['edit', 'delete'],
  rejected: ['edit', 'delete'],
};

/** Action -> new status + confirmation dialog (if needed) */
const STATUS_ACTIONS = {
  sold: {
    status: 'sold',
    confirm: {
      title: 'Đánh dấu đã bán?',
      message: 'Tin sẽ chuyển sang "Đã bán", người mua không đặt được nữa. Bạn có thể đăng bán lại sau.',
      confirmText: 'Đã bán',
    },
  },
  hide: { status: 'hidden' },
  show: { status: 'active' },
  relist: { status: 'active' },
};

/** Message when the selected tab has no listings */
const EMPTY_TEXTS = {
  all: 'Bạn chưa đăng tin nào. Đăng tin đầu tiên để bắt đầu bán nhé!',
  active: 'Không có tin nào đang bán.',
  pending: 'Không có tin nào đang chờ duyệt.',
  sold: 'Chưa có món nào được bán.',
  hidden: 'Không có tin nào đang ẩn.',
  rejected: 'Không có tin nào bị từ chối.',
};

class MyListingsPage {
  filters = { status: '', q: '', page: 1 };
  /** Map id -> listing on screen */
  listings = new Map();
  controller = null;

  constructor() {
    this.el = {
      tabs: $('#status-tabs'),
      search: $('#my-search'),
      list: $('#my-list'),
      loading: $('#my-loading'),
      empty: $('#my-empty'),
      error: $('#my-error'),
      pagination: $('#pagination'),
      summary: $('#my-summary'),
    };
  }

  async init() {
    const user = await getCurrentUser().catch(() => null);
    if (!user) {
      window.location.replace(loginUrl());
      return;
    }

    initHeader();
    this.readFilters();
    this.el.search.value = this.filters.q;
    this.bindEvents();
    this.load();
  }

  readFilters() {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status') ?? '';
    this.filters = {
      status: status in LISTING_STATUS_LABELS ? status : '',
      q: (params.get('q') ?? '').slice(0, 100),
      page: Math.max(1, Number.parseInt(params.get('page'), 10) || 1),
    };
  }

  /** Change filters -> write them to the URL -> reload */
  setFilters(patch) {
    this.filters = { ...this.filters, page: 1, ...patch };
    const params = new URLSearchParams();
    if (this.filters.status) params.set('status', this.filters.status);
    if (this.filters.q) params.set('q', this.filters.q);
    if (this.filters.page > 1) params.set('page', this.filters.page);
    const query = params.toString();
    history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
    this.load();
  }

  // =======================================================
  //  LOADING DATA
  // =======================================================
  /** 'loading' | 'list' | 'empty' | 'error' - blocks written in the HTML */
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

    // A list is already shown -> fade it instead of showing skeletons (less jumpy)
    if (this.el.list.hidden) this.showState('loading');
    else this.el.list.classList.add('is-loading');

    try {
      const { data, meta } = await getMyListings({ ...this.filters, limit: PAGE_SIZE }, controller.signal);

      // The current page has no listings left (e.g. the last one was just deleted) -> go back one page
      if (data.length === 0 && this.filters.page > 1) {
        this.setFilters({ page: this.filters.page - 1 });
        return;
      }

      this.renderTabs(meta.counts);
      this.renderList(data, meta);
    } catch (err) {
      if (isAbortError(err)) return;
      $('#my-error-message').textContent = err.message;
      this.showState('error');
    } finally {
      if (this.controller === controller) this.el.list.classList.remove('is-loading');
    }
  }

  // =======================================================
  //  RENDERING
  // =======================================================
  /** Update the counts + selected tab (the tabs are written in the HTML) */
  renderTabs(counts) {
    $$('[data-status-tab]', this.el.tabs).forEach((tab) => {
      const status = tab.dataset.statusTab;
      tab.querySelector('[data-tab-count]').textContent = counts[status || 'all'] ?? 0;
      const active = status === this.filters.status;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-pressed', String(active));
    });
  }

  renderList(items, meta) {
    this.listings = new Map(items.map((item) => [item.id, item]));
    const { q, status } = this.filters;

    this.el.summary.textContent = q
      ? `${meta.total} tin khớp với "${q}"`
      : `${meta.total} tin${status ? ` · ${LISTING_STATUS_LABELS[status]}` : ''}`;

    if (items.length === 0) {
      $('#my-empty-text').textContent = q
        ? `Không tìm thấy tin nào khớp với "${q}".`
        : EMPTY_TEXTS[status || 'all'];
      // Only suggest posting when there really are no listings at all
      $('#my-empty-cta').hidden = Boolean(q || status);
      this.showState('empty');
      return;
    }

    this.el.list.replaceChildren(...items.map((item) => this.createRow(item)));
    this.showState('list');
    renderPagination(this.el.pagination, meta);
  }

  /** One listing row from <template id="tpl-my-listing"> */
  createRow(item) {
    const row = cloneTemplate('tpl-my-listing');
    row.dataset.id = item.id;

    fillFields(row, {
      title: item.title,
      price: formatVND(item.price),
      status: LISTING_STATUS_LABELS[item.status],
      views: `${item.views.toLocaleString('vi-VN')} lượt xem`,
      created: `Đăng ${timeAgo(item.createdAt)}`,
      category: item.category.name,
    });

    // Cover image or category icon
    const thumb = row.querySelector('.my-listing__thumb');
    thumb.href = listingUrl(item.id);
    if (item.thumbnail) {
      const img = thumb.querySelector('img');
      img.src = assetUrl(item.thumbnail);
      img.alt = item.title;
      img.hidden = false;
      thumb.querySelector('.my-listing__placeholder').hidden = true;
    } else {
      thumb.querySelector('.my-listing__placeholder .bi').className = `bi ${item.category.icon ?? 'bi-box-seam'}`;
    }
    row.querySelector('.my-listing__title').href = listingUrl(item.id);
    row.querySelector('.badge').classList.add(`badge--status-${item.status}`);
    row.querySelector('[data-field="created"]').title = formatDate(item.createdAt);

    // Extra info depending on the status
    const note = row.querySelector('.my-listing__note');
    if (item.status === 'rejected') {
      note.textContent = `Lý do từ chối: ${item.rejectReason || 'không ghi rõ'}. Sửa tin để gửi duyệt lại.`;
      note.classList.add('is-error');
      note.hidden = false;
    } else if (item.status === 'pending') {
      note.textContent = 'Đang chờ quản trị viên duyệt, người khác chưa nhìn thấy tin này.';
      note.hidden = false;
    } else if (item.status === 'sold' && item.soldAt) {
      note.textContent = `Đã bán ngày ${formatDate(item.soldAt)}.`;
      note.hidden = false;
    }

    // Only show the buttons valid for the status; listings with orders cannot be deleted
    const allowed = new Set(ACTIONS_BY_STATUS[item.status] ?? []);
    if (item.orderCount > 0) allowed.delete('delete');
    row.querySelectorAll('[data-action]').forEach((btn) => {
      btn.hidden = !allowed.has(btn.dataset.action);
    });
    const edit = row.querySelector('[data-action="edit"]');
    edit.href = `/sell?edit=${item.id}`;

    return row;
  }

  // =======================================================
  //  ACTIONS
  // =======================================================
  async changeStatus(item, action, button) {
    const { status, confirm } = STATUS_ACTIONS[action];
    if (confirm && !(await confirmDialog(confirm))) return;

    button.disabled = true;
    try {
      const { message } = await updateListingStatus(item.id, status);
      showToast(message, 'success');
      this.load(); // tab counts changed -> reload
    } catch (err) {
      showToast(err.message, 'error');
      button.disabled = false;
    }
  }

  async remove(item, button) {
    const ok = await confirmDialog({
      title: 'Xóa tin đăng?',
      message: `"${item.title}" và toàn bộ ảnh sẽ bị xóa vĩnh viễn, không khôi phục được.`,
      confirmText: 'Xóa tin',
      danger: true,
    });
    if (!ok) return;

    button.disabled = true;
    try {
      showToast(await deleteListing(item.id), 'success');
      this.load();
    } catch (err) {
      showToast(err.message, 'error');
      button.disabled = false;
    }
  }

  bindEvents() {
    // Status tabs
    this.el.tabs.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-status-tab]');
      if (tab) this.setFilters({ status: tab.dataset.statusTab });
    });

    // Search: debounced, Enter searches immediately
    const search = debounce(() => this.setFilters({ q: this.el.search.value.trim() }), 400);
    this.el.search.addEventListener('input', search);
    $('#my-search-form').addEventListener('submit', (e) => {
      e.preventDefault();
      search.cancel();
      this.setFilters({ q: this.el.search.value.trim() });
    });

    // Buttons on each row (event delegation)
    this.el.list.addEventListener('click', (e) => {
      const button = e.target.closest('button[data-action]');
      if (!button) return;
      const item = this.listings.get(Number(button.closest('[data-id]').dataset.id));
      if (!item) return;

      const { action } = button.dataset;
      if (action === 'delete') this.remove(item, button);
      else if (STATUS_ACTIONS[action]) this.changeStatus(item, action, button);
    });

    // Pagination
    this.el.pagination.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-page]');
      if (!btn || btn.disabled) return;
      this.setFilters({ page: Number(btn.dataset.page) });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    $('#my-retry').addEventListener('click', () => this.load());
  }
}

new MyListingsPage().init();
