/**
 * MY LISTINGS PAGE: /my-listings?status=&q=&page= (login required)
 *  - Status tabs with counts, search, pagination (shared logic in components/list-page.js)
 *  - Actions by status: edit, mark as sold, hide, show again, relist, delete
 *    (confirmed with a <dialog> before deleting / marking as sold)
 */
import { $ } from '../utils/dom.js';
import { cloneTemplate, fillFields } from '../utils/template.js';
import { formatVND, formatDate, timeAgo, LISTING_STATUS_LABELS } from '../utils/format.js';
import { assetUrl } from '../config.js';
import { getCurrentUser, loginUrl } from '../services/auth.js';
import { getMyListings, updateListingStatus, deleteListing } from '../services/catalog.js';
import { initHeader } from '../components/header.js';
import { confirmDialog } from '../components/confirm-dialog.js';
import { listingUrl } from '../components/listing-card.js';
import { ListPage } from '../components/list-page.js';

/** Buttons shown for each listing status ("delete" is also hidden when the listing has orders) */
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

class MyListingsPage extends ListPage {
  defaults = { status: '', q: '', page: 1 };

  constructor() {
    super({
      list: '#my-list',
      loading: '#my-loading',
      empty: '#my-empty',
      error: '#my-error',
      errorMessage: '#my-error-message',
      retry: '#my-retry',
      pagination: '#pagination',
      tabs: '#status-tabs',
      search: '#my-search',
      searchForm: '#my-search-form',
    });
  }

  async init() {
    const user = await getCurrentUser().catch(() => null);
    if (!user) {
      window.location.replace(loginUrl());
      return;
    }
    initHeader();
    this.start();
  }

  parseFilters(params) {
    const status = params.get('status') ?? '';
    return {
      status: status in LISTING_STATUS_LABELS ? status : '',
      q: (params.get('q') ?? '').slice(0, 100),
      page: ListPage.readPage(params),
    };
  }

  fetchPage(params, signal) {
    return getMyListings(params, signal);
  }

  onData(meta) {
    const { q, status } = this.filters;
    $('#my-summary').textContent = q
      ? `${meta.total} tin khớp với "${q}"`
      : `${meta.total} tin${status ? ` · ${LISTING_STATUS_LABELS[status]}` : ''}`;
  }

  renderEmpty() {
    const { q, status } = this.filters;
    $('#my-empty-text').textContent = q ? `Không tìm thấy tin nào khớp với "${q}".` : EMPTY_TEXTS[status || 'all'];
    // Only suggest posting when there really are no listings at all
    $('#my-empty-cta').hidden = Boolean(q || status);
  }

  /** One listing row from <template id="tpl-my-listing"> */
  createItem(item) {
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
    row.querySelector('[data-action="edit"]').href = `/sell?edit=${item.id}`;
    return row;
  }

  async handleAction(item, action, button) {
    if (action === 'delete') {
      const ok = await confirmDialog({
        title: 'Xóa tin đăng?',
        message: `"${item.title}" và toàn bộ ảnh sẽ bị xóa vĩnh viễn, không khôi phục được.`,
        confirmText: 'Xóa tin',
        danger: true,
      });
      if (ok) this.runTask(button, () => deleteListing(item.id));
      return;
    }

    const config = STATUS_ACTIONS[action];
    if (!config) return;
    if (config.confirm && !(await confirmDialog(config.confirm))) return;
    this.runTask(button, async () => (await updateListingStatus(item.id, config.status)).message);
  }
}

new MyListingsPage().init();
