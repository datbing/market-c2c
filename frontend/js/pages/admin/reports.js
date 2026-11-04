/**
 * ADMIN - REPORTS: /admin/reports?status=&page=
 *  - Tabs: Open / Resolved / Dismissed / All (defaults to "Open")
 *  - Each report: reported listing, reporter, reason
 *  - Actions: dismiss | resolve | take down (enter a reason, also closes every report of that listing)
 *  - Tabs, pagination, loading states: components/list-page.js
 */
import { cloneTemplate, fillFields } from '../../utils/template.js';
import { formatDate, timeAgo, LISTING_STATUS_LABELS } from '../../utils/format.js';
import { assetUrl } from '../../config.js';
import { getAdminReports, handleReport } from '../../services/admin.js';
import { initAdminShell, refreshAdminBadges } from '../../components/admin-shell.js';
import { promptDialog } from '../../components/prompt-dialog.js';
import { confirmDialog } from '../../components/confirm-dialog.js';
import { listingUrl } from '../../components/listing-card.js';
import { ListPage } from '../../components/list-page.js';

const REPORT_LABELS = { open: 'Chưa xử lý', resolved: 'Đã xử lý', dismissed: 'Bỏ qua' };
const REPORT_BADGES = { open: 'badge--status-pending', resolved: 'badge--status-active', dismissed: 'badge--status-hidden' };

class AdminReportsPage extends ListPage {
  defaults = { status: 'open', page: 1 };

  constructor() {
    super({
      list: '#report-list',
      empty: '#admin-empty',
      error: '#admin-error',
      errorMessage: '#admin-error-message',
      retry: '#admin-retry',
      pagination: '#pagination',
      tabs: '#status-tabs',
    });
  }

  async init() {
    if (await initAdminShell()) this.start();
  }

  parseFilters(params) {
    const status = params.get('status');
    return {
      // No status in the URL -> "Open"; ?status= (empty) -> "All"
      status: status === null ? 'open' : status in REPORT_LABELS ? status : '',
      page: ListPage.readPage(params),
    };
  }

  fetchPage(params, signal) {
    return getAdminReports(params, signal);
  }

  createItem(report) {
    const card = cloneTemplate('tpl-report');
    card.dataset.id = report.id;
    const { listing } = report;
    fillFields(card, {
      code: `#${report.id}`,
      date: `Báo cáo ${timeAgo(report.createdAt)}`,
      status: REPORT_LABELS[report.status],
      title: listing.title,
      listingStatus: LISTING_STATUS_LABELS[listing.status] ?? listing.status,
      seller: listing.seller.name,
      reporter: `${report.reporter.name} (${report.reporter.email})`,
      reason: report.reason,
    });
    card.querySelector('[data-field="date"]').title = formatDate(report.createdAt);
    card.querySelector('[data-field="status"]').classList.add(REPORT_BADGES[report.status]);
    card.querySelector('[data-field="listingStatus"]').classList.add(`badge--status-${listing.status}`);
    card.querySelectorAll('a[data-link="listing"]').forEach((a) => {
      a.href = listingUrl(listing.id);
    });
    if (listing.thumbnail) {
      const img = card.querySelector('img');
      img.src = assetUrl(listing.thumbnail);
      img.alt = listing.title;
      img.hidden = false;
      card.querySelector('.order-card__placeholder').hidden = true;
    }

    // Only open reports get buttons; an already removed listing needs no "Take down" button
    const isOpen = report.status === 'open';
    card.querySelector('.order-card__actions').hidden = !isOpen;
    card.querySelector('[data-action="takedown"]').hidden = !isOpen || listing.status === 'rejected';
    return card;
  }

  async handleAction(report, action, button) {
    let reason;
    if (action === 'takedown') {
      reason = await promptDialog({
        title: 'Gỡ tin vi phạm',
        message: `Tin "${report.listing.title}" sẽ bị gỡ, người bán thấy lý do bên dưới. Mọi báo cáo khác của tin này cũng được đóng.`,
        placeholder: 'Lý do gỡ tin (để trống = dùng lý do báo cáo)',
        suggestions: [report.reason, 'Hàng giả / hàng nhái', 'Lừa đảo, thông tin sai sự thật'],
        confirmText: 'Gỡ tin',
        danger: true,
      });
      if (reason === null) return;
    } else {
      const ok = await confirmDialog(
        action === 'dismiss'
          ? { title: 'Bỏ qua báo cáo?', message: 'Báo cáo không đúng, tin vẫn được giữ nguyên.', confirmText: 'Bỏ qua' }
          : { title: 'Đánh dấu đã xử lý?', message: 'Ví dụ: đã nhắc người bán sửa tin. Tin vẫn được giữ nguyên.', confirmText: 'Đã xử lý' },
      );
      if (!ok) return;
    }
    if (await this.runTask(button, () => handleReport(report.id, action, reason || undefined))) refreshAdminBadges();
  }
}

new AdminReportsPage().init();
