/**
 * ADMIN - REPORTS: /admin/reports?status=&page=
 *  - Tabs: Open / Resolved / Dismissed / All (defaults to "Open")
 *  - Each report: reported listing, reporter, reason
 *  - Actions: dismiss | resolve | take down (enter a reason, also closes every report of that listing)
 */
import { $, $$ } from '../../utils/dom.js';
import { cloneTemplate, fillFields } from '../../utils/template.js';
import { formatDate, timeAgo, LISTING_STATUS_LABELS } from '../../utils/format.js';
import { assetUrl } from '../../config.js';
import { isAbortError } from '../../services/api.js';
import { getAdminReports, handleReport } from '../../services/admin.js';
import { initAdminShell, refreshAdminBadges } from '../../components/admin-shell.js';
import { renderPagination } from '../../components/pagination.js';
import { promptDialog } from '../../components/prompt-dialog.js';
import { confirmDialog } from '../../components/confirm-dialog.js';
import { showToast } from '../../components/toast.js';
import { listingUrl } from '../../components/listing-card.js';

const PAGE_SIZE = 10;
const REPORT_LABELS = { open: 'Chưa xử lý', resolved: 'Đã xử lý', dismissed: 'Bỏ qua' };
const REPORT_BADGES = { open: 'badge--status-pending', resolved: 'badge--status-active', dismissed: 'badge--status-hidden' };

class AdminReportsPage {
  filters = { status: 'open', page: 1 };
  reports = new Map();
  controller = null;

  async init() {
    if (!(await initAdminShell())) return;
    this.el = {
      tabs: $('#status-tabs'),
      list: $('#report-list'),
      empty: $('#admin-empty'),
      error: $('#admin-error'),
      pagination: $('#pagination'),
    };
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    this.filters = {
      status: status === null ? 'open' : status in REPORT_LABELS ? status : '',
      page: Math.max(1, Number.parseInt(params.get('page'), 10) || 1),
    };
    this.bindEvents();
    this.load();
  }

  setFilters(patch) {
    this.filters = { ...this.filters, page: 1, ...patch };
    const params = new URLSearchParams({ status: this.filters.status });
    if (this.filters.page > 1) params.set('page', this.filters.page);
    history.replaceState(null, '', `${window.location.pathname}?${params}`);
    this.load();
  }

  showState(state) {
    this.el.list.hidden = state !== 'list';
    this.el.empty.hidden = state !== 'empty';
    this.el.error.hidden = state !== 'error';
    if (state !== 'list') this.el.pagination.hidden = true;
  }

  async load() {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.el.list.classList.add('is-loading');
    try {
      const { data, meta } = await getAdminReports({ ...this.filters, limit: PAGE_SIZE }, controller.signal);
      $$('[data-status-tab]', this.el.tabs).forEach((tab) => {
        const status = tab.dataset.statusTab;
        tab.querySelector('[data-tab-count]').textContent = meta.counts[status || 'all'] ?? 0;
        tab.classList.toggle('is-active', status === this.filters.status);
        tab.setAttribute('aria-pressed', String(status === this.filters.status));
      });
      this.reports = new Map(data.map((r) => [r.id, r]));
      if (data.length === 0) {
        this.showState('empty');
        return;
      }
      this.el.list.replaceChildren(...data.map((r) => this.createCard(r)));
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

  createCard(report) {
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

  async act(report, action, button) {
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

    button.disabled = true;
    try {
      showToast(await handleReport(report.id, action, reason || undefined), 'success');
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
    this.el.list.addEventListener('click', (e) => {
      const button = e.target.closest('button[data-action]');
      if (!button) return;
      const report = this.reports.get(Number(button.closest('[data-id]').dataset.id));
      if (report) this.act(report, button.dataset.action, button);
    });
    this.el.pagination.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-page]');
      if (btn && !btn.disabled) this.setFilters({ page: Number(btn.dataset.page) });
    });
    $('#admin-retry').addEventListener('click', () => this.load());
  }
}

new AdminReportsPage().init();
