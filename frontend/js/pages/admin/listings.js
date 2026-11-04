/**
 * ADMIN - LISTING REVIEW: /admin/listings?status=&q=&page=
 *  - Opens "Pending" by default, search by title / seller name / email
 *  - Approve (pending, rejected -> active), reject / take down (reason required, with suggestions)
 *  - Listings with open reports are flagged
 *  - Tabs, search, pagination, loading states: components/list-page.js
 */
import { cloneTemplate, fillFields } from '../../utils/template.js';
import { formatVND, formatDate, timeAgo, LISTING_STATUS_LABELS } from '../../utils/format.js';
import { assetUrl } from '../../config.js';
import { getAdminListings, reviewListing } from '../../services/admin.js';
import { initAdminShell, refreshAdminBadges } from '../../components/admin-shell.js';
import { promptDialog } from '../../components/prompt-dialog.js';
import { confirmDialog } from '../../components/confirm-dialog.js';
import { listingUrl } from '../../components/listing-card.js';
import { ListPage } from '../../components/list-page.js';

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

class AdminListingsPage extends ListPage {
  defaults = { status: 'pending', q: '', page: 1 };

  constructor() {
    super({
      list: '#admin-list',
      loading: '#admin-loading',
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
    if (await initAdminShell()) this.start();
  }

  parseFilters(params) {
    const status = params.get('status');
    return {
      // No status in the URL -> "Pending"; ?status= (empty) -> "All"
      status: status === null ? 'pending' : status in LISTING_STATUS_LABELS ? status : '',
      q: (params.get('q') ?? '').slice(0, 100),
      page: ListPage.readPage(params),
    };
  }

  fetchPage(params, signal) {
    return getAdminListings(params, signal);
  }

  createItem(item) {
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

  async handleAction(item, action, button) {
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
    const review = action === 'approve' ? 'approve' : 'reject';
    if (await this.runTask(button, () => reviewListing(item.id, review, reason))) refreshAdminBadges();
  }
}

new AdminListingsPage().init();
