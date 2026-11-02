/**
 * ADMIN - OVERVIEW: /admin/
 *  - KPI cards (users, active listings, pending, completed orders, revenue, reports)
 *  - 4 charts drawn with Canvas (components/charts.js):
 *      bars: new listings + orders per day | line: revenue per day
 *      donut: listings by status           | horizontal bars: active listings per category
 *  - Switch the range between 7 / 14 / 30 days, refresh the numbers
 */
import { $ } from '../../utils/dom.js';
import { cloneTemplate, fillFields } from '../../utils/template.js';
import { formatVND, formatCompact, LISTING_STATUS_LABELS } from '../../utils/format.js';
import { getAdminStats } from '../../services/admin.js';
import { initAdminShell, refreshAdminBadges } from '../../components/admin-shell.js';
import { BarChart, LineChart, HBarChart, DonutChart, resolveColor } from '../../components/charts.js';

/** Color of each listing status (CSS variable name -> follows the theme) */
const STATUS_COLORS = {
  pending: '--color-warning',
  active: '--color-success',
  sold: '--color-info',
  hidden: '--color-text-muted',
  rejected: '--color-danger',
};

/** "2026-10-26" -> "26/10" */
const shortDate = (day) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

class Dashboard {
  charts = {};

  async init() {
    if (!(await initAdminShell({ badges: false }))) return;
    $('#stats-days').addEventListener('change', () => this.load());
    $('#stats-refresh').addEventListener('click', () => this.load());
    $('#stats-retry').addEventListener('click', () => this.load());
    await this.load();
  }

  async load() {
    const days = Number($('#stats-days').value);
    const refresh = $('#stats-refresh');
    refresh.disabled = true;
    refresh.classList.add('is-loading');
    try {
      const stats = await getAdminStats(days);
      $('#stats-error').hidden = true;
      $('#dashboard').hidden = false;
      this.renderKpis(stats);
      this.renderCharts(stats);
      refreshAdminBadges(stats); // reuse the freshly loaded stats for the sidebar
      $('#stats-time').textContent = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    } catch (err) {
      $('#stats-error-message').textContent = err.message;
      $('#stats-error').hidden = false;
      $('#dashboard').hidden = true;
    } finally {
      refresh.disabled = false;
      refresh.classList.remove('is-loading');
    }
  }

  renderKpis({ users, listings, orders, revenue, openReports }) {
    const set = (name, value, sub) => {
      const card = $(`[data-kpi="${name}"]`);
      card.querySelector('[data-kpi-value]').textContent = value;
      card.querySelector('[data-kpi-sub]').textContent = sub;
      card.classList.remove('is-loading');
    };
    set('users', users.total.toLocaleString('vi-VN'), `+${users.new7d} trong 7 ngày · ${users.locked} bị khóa`);
    set('active', listings.active.toLocaleString('vi-VN'), `${listings.all} tin tất cả · ${listings.sold} đã bán`);
    set('pending', listings.pending.toLocaleString('vi-VN'), listings.pending ? 'Bấm để duyệt ngay' : 'Không có tin chờ duyệt');
    set(
      'orders',
      orders.completed.toLocaleString('vi-VN'),
      `${orders.pending + orders.confirmed + orders.shipping} đang xử lý · ${orders.cancelled} đã hủy`,
    );
    set('revenue', formatCompact(revenue), formatVND(revenue));
    set('reports', openReports.toLocaleString('vi-VN'), openReports ? 'Cần xem xét' : 'Không có báo cáo mới');

    // Highlight cards that need attention (pending listings / open reports)
    $('[data-kpi="pending"]').classList.toggle('is-alert', listings.pending > 0);
    $('[data-kpi="reports"]').classList.toggle('is-alert', openReports > 0);
  }

  renderCharts({ daily, listings, categories }) {
    const labels = daily.days.map(shortDate);

    const activity = {
      labels,
      series: [
        { name: 'Tin đăng mới', values: daily.listings, color: '--color-primary' },
        { name: 'Đơn hàng mới', values: daily.orders, color: '--color-info' },
      ],
    };
    const revenue = { labels, values: daily.revenue, name: 'Doanh thu', color: '--color-success' };
    const statusItems = Object.keys(STATUS_COLORS).map((status) => ({
      label: LISTING_STATUS_LABELS[status],
      value: listings[status],
      color: STATUS_COLORS[status],
    }));
    const categoryItems = categories
      .map((c) => ({ label: c.name, value: c.total }))
      .sort((a, b) => b.value - a.value);

    // First time: create the charts. Later: only update their data
    const { charts } = this;
    if (!charts.activity) {
      charts.activity = new BarChart($('#chart-activity'), activity, { height: 260 });
      charts.revenue = new LineChart($('#chart-revenue'), revenue, {
        height: 260,
        format: formatVND,
        axisFormat: formatCompact, // compact Y axis labels: 1,5 Tr
      });
      charts.status = new DonutChart($('#chart-status'), { items: statusItems, centerLabel: 'tin đăng' }, { height: 220 });
      charts.categories = new HBarChart($('#chart-categories'), { items: categoryItems }, {
        height: Math.max(180, categoryItems.length * 34),
      });
    } else {
      charts.activity.update(activity);
      charts.revenue.update(revenue);
      charts.status.update({ items: statusItems, centerLabel: 'tin đăng' });
      charts.categories.update({ items: categoryItems });
    }

    this.renderLegend(statusItems);
    $('#activity-total').textContent = `${daily.listings.reduce((a, b) => a + b, 0)} tin · ${daily.orders.reduce((a, b) => a + b, 0)} đơn`;
    $('#revenue-total').textContent = formatVND(daily.revenue.reduce((a, b) => a + b, 0));
  }

  /** Donut chart legend (HTML, readable by screen readers) */
  renderLegend(items) {
    const total = items.reduce((sum, i) => sum + i.value, 0) || 1;
    $('#status-legend').replaceChildren(
      ...items.map((item) => {
        const li = cloneTemplate('tpl-legend');
        fillFields(li, { label: item.label, value: `${item.value} (${Math.round((item.value / total) * 100)}%)` });
        li.querySelector('.chart__dot').style.background = resolveColor(item.color);
        return li;
      }),
    );
    // Legend colors must follow theme changes
    window.addEventListener('theme:change', () => this.renderLegend(items), { once: true });
  }
}

new Dashboard().init();
