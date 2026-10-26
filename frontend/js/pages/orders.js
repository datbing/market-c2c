/**
 * TRANG ĐƠN HÀNG: /orders?role=buyer|seller&status=&page= (bắt buộc đăng nhập)
 *  - Tab "Đơn mua" / "Đơn bán", lọc theo trạng thái kèm số đếm
 *  - Thanh tiến trình: Chờ xác nhận -> Đã xác nhận -> Đang giao -> Hoàn thành (CSS vẽ theo class)
 *  - Nút thao tác theo vai trò + trạng thái (khớp bảng TRANSITIONS ở server/controllers/order.controller.js):
 *      người bán: xác nhận, giao hàng, hoàn thành, hủy
 *      người mua: hủy (khi chờ xác nhận), đã nhận hàng (khi đang giao)
 *  - Hoàn thành đơn -> tin tự chuyển "Đã bán" (đánh dấu hoàn thành của đề)
 */
import { $, $$ } from '../utils/dom.js';
import { cloneTemplate, fillFields } from '../utils/template.js';
import { formatVND, formatDate, timeAgo, ORDER_STATUS_LABELS } from '../utils/format.js';
import { assetUrl } from '../config.js';
import { isAbortError } from '../services/api.js';
import { getCurrentUser, loginUrl } from '../services/auth.js';
import { getOrders, updateOrderStatus } from '../services/orders.js';
import { initHeader, showOrderBadge } from '../components/header.js';
import { showToast } from '../components/toast.js';
import { renderPagination } from '../components/pagination.js';
import { confirmDialog } from '../components/confirm-dialog.js';
import { listingUrl } from '../components/listing-card.js';

const PAGE_SIZE = 10;
const STEPS = ['pending', 'confirmed', 'shipping', 'completed'];

/** Nút được hiện theo vai trò + trạng thái đơn */
const ACTIONS = {
  seller: { pending: ['confirm', 'cancel'], confirmed: ['ship', 'cancel'], shipping: ['complete'] },
  buyer: { pending: ['cancel'], shipping: ['received'] },
};

/** Nút -> trạng thái mới + hộp xác nhận (nếu cần) */
const ACTION_CONFIG = {
  confirm: { status: 'confirmed' },
  ship: { status: 'shipping' },
  complete: {
    status: 'completed',
    confirm: {
      title: 'Hoàn thành đơn hàng?',
      message: 'Xác nhận người mua đã nhận hàng. Tin sẽ chuyển sang "Đã bán".',
      confirmText: 'Hoàn thành',
    },
  },
  received: {
    status: 'completed',
    confirm: {
      title: 'Bạn đã nhận được hàng?',
      message: 'Chỉ xác nhận khi đã nhận và kiểm tra hàng. Đơn sẽ hoàn thành và không đổi lại được.',
      confirmText: 'Đã nhận hàng',
    },
  },
  cancel: {
    status: 'cancelled',
    confirm: {
      title: 'Hủy đơn hàng?',
      message: 'Đơn sẽ bị hủy và món đồ được mở bán lại cho người khác.',
      confirmText: 'Hủy đơn',
      danger: true,
    },
  },
};

const EMPTY_TEXTS = {
  buyer: 'Bạn chưa mua món nào. Dạo một vòng và đặt món đầu tiên nhé!',
  seller: 'Chưa có ai đặt mua tin của bạn.',
};

class OrdersPage {
  filters = { role: 'buyer', status: '', page: 1 };
  orders = new Map();
  controller = null;

  constructor() {
    this.el = {
      roleTabs: $('#role-tabs'),
      statusTabs: $('#status-tabs'),
      list: $('#order-list'),
      loading: $('#order-loading'),
      empty: $('#order-empty'),
      error: $('#order-error'),
      pagination: $('#pagination'),
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
    this.bindEvents();
    this.load();
  }

  readFilters() {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status') ?? '';
    this.filters = {
      role: params.get('role') === 'seller' ? 'seller' : 'buyer',
      status: status in ORDER_STATUS_LABELS ? status : '',
      page: Math.max(1, Number.parseInt(params.get('page'), 10) || 1),
    };
  }

  setFilters(patch) {
    this.filters = { ...this.filters, page: 1, ...patch };
    const { role, status, page } = this.filters;
    const params = new URLSearchParams({ role });
    if (status) params.set('status', status);
    if (page > 1) params.set('page', page);
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

    this.renderRoleTabs();
    if (this.el.list.hidden) this.showState('loading');
    else this.el.list.classList.add('is-loading');

    try {
      const { data, meta } = await getOrders({ ...this.filters, limit: PAGE_SIZE }, controller.signal);
      if (data.length === 0 && this.filters.page > 1) {
        this.setFilters({ page: this.filters.page - 1 });
        return;
      }
      this.renderStatusTabs(meta.counts);
      this.renderRoleBadges(meta.needAction);
      this.renderList(data, meta);
    } catch (err) {
      if (isAbortError(err)) return;
      $('#order-error-message').textContent = err.message;
      this.showState('error');
    } finally {
      if (this.controller === controller) this.el.list.classList.remove('is-loading');
    }
  }

  // =======================================================
  //  HIỂN THỊ
  // =======================================================
  renderRoleTabs() {
    $$('[data-role-tab]', this.el.roleTabs).forEach((tab) => {
      const active = tab.dataset.roleTab === this.filters.role;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-pressed', String(active));
    });
  }

  /** Số đỏ trên tab Đơn mua / Đơn bán = số đơn đang chờ mình xử lý */
  renderRoleBadges(needAction = {}) {
    $('[data-role-tab]', this.el.roleTabs).forEach((tab) => {
      const n = needAction[tab.dataset.roleTab] ?? 0;
      const badge = tab.querySelector('[data-role-badge]');
      badge.textContent = n;
      badge.hidden = n === 0;
      badge.title = `${n} đơn cần bạn xử lý`;
    });
  }

  renderStatusTabs(counts) {
    $$('[data-status-tab]', this.el.statusTabs).forEach((tab) => {
      const status = tab.dataset.statusTab;
      tab.querySelector('[data-tab-count]').textContent = counts[status || 'all'] ?? 0;
      const active = status === this.filters.status;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-pressed', String(active));
    });
  }

  renderList(orders, meta) {
    this.orders = new Map(orders.map((o) => [o.id, o]));
    if (orders.length === 0) {
      $('#order-empty-text').textContent = this.filters.status
        ? `Không có đơn nào "${ORDER_STATUS_LABELS[this.filters.status]}".`
        : EMPTY_TEXTS[this.filters.role];
      this.showState('empty');
      return;
    }
    this.el.list.replaceChildren(...orders.map((order) => this.createCard(order)));
    this.showState('list');
    renderPagination(this.el.pagination, meta);
  }

  createCard(order) {
    const card = cloneTemplate('tpl-order');
    card.dataset.id = order.id;
    const isSeller = order.myRole === 'seller';
    const party = isSeller ? order.buyer : order.seller;

    fillFields(card, {
      code: `#${order.id}`,
      date: `Đặt ${timeAgo(order.createdAt)}`,
      status: ORDER_STATUS_LABELS[order.status],
      title: order.listing.title,
      price: formatVND(order.price),
      partyLabel: isSeller ? 'Người mua' : 'Người bán',
      partyName: party.name,
      receiverName: order.receiver.name,
      receiverPhone: order.receiver.phone,
      receiverAddress: `${order.receiver.address}, ${order.receiver.province}`,
      note: order.note || 'Không có',
    });
    card.querySelector('[data-field="date"]').title = formatDate(order.createdAt);
    card.querySelector('.badge').classList.add(`badge--order-${order.status}`);

    // Liên hệ: số điện thoại của bên kia (gọi trực tiếp bằng link tel:)
    const phone = isSeller ? order.receiver.phone : party.phone;
    const phoneLink = card.querySelector('[data-field="partyPhone"]');
    phoneLink.hidden = !phone;
    if (phone) {
      phoneLink.textContent = phone;
      phoneLink.href = `tel:${phone}`;
    }

    // Ảnh + link tới tin
    card.querySelectorAll('a.order-card__thumb, a.order-card__title').forEach((a) => {
      a.href = listingUrl(order.listing.id);
    });
    if (order.listing.thumbnail) {
      const img = card.querySelector('.order-card__thumb img');
      img.src = assetUrl(order.listing.thumbnail);
      img.alt = order.listing.title;
      img.hidden = false;
      card.querySelector('.order-card__placeholder').hidden = true;
    }

    this.renderSteps(card, order.status);

    // Nút theo vai trò + trạng thái
    const allowed = new Set(ACTIONS[order.myRole]?.[order.status] ?? []);
    card.querySelectorAll('[data-order-action]').forEach((btn) => {
      btn.hidden = !allowed.has(btn.dataset.orderAction);
    });
    card.querySelector('.order-card__actions').hidden = allowed.size === 0;
    return card;
  }

  /** Thanh tiến trình: bước đã qua = is-done, bước hiện tại = is-current */
  renderSteps(card, status) {
    const steps = card.querySelector('.order-steps');
    const cancelled = card.querySelector('.order-card__cancelled');
    if (status === 'cancelled') {
      steps.hidden = true;
      cancelled.hidden = false;
      return;
    }
    const current = STEPS.indexOf(status);
    steps.querySelectorAll('[data-step]').forEach((li) => {
      const index = STEPS.indexOf(li.dataset.step);
      li.classList.toggle('is-done', index < current || status === 'completed');
      li.classList.toggle('is-current', index === current && status !== 'completed');
      if (index === current) li.setAttribute('aria-current', 'step');
    });
  }

  // =======================================================
  //  HÀNH ĐỘNG
  // =======================================================
  async runAction(order, action, button) {
    const { status, confirm } = ACTION_CONFIG[action];
    if (confirm && !(await confirmDialog(confirm))) return;

    button.disabled = true;
    try {
      const { message } = await updateOrderStatus(order.id, status);
      showToast(message, 'success');
      this.load();
      showOrderBadge(); // cập nhật số đơn cần xử lý trên header
    } catch (err) {
      showToast(err.message, 'error');
      button.disabled = false;
    }
  }

  bindEvents() {
    this.el.roleTabs.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-role-tab]');
      if (tab && tab.dataset.roleTab !== this.filters.role) this.setFilters({ role: tab.dataset.roleTab, status: '' });
    });

    this.el.statusTabs.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-status-tab]');
      if (tab) this.setFilters({ status: tab.dataset.statusTab });
    });

    this.el.list.addEventListener('click', (e) => {
      const button = e.target.closest('[data-order-action]');
      if (!button) return;
      const order = this.orders.get(Number(button.closest('[data-id]').dataset.id));
      if (order) this.runAction(order, button.dataset.orderAction, button);
    });

    this.el.pagination.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-page]');
      if (!btn || btn.disabled) return;
      this.setFilters({ page: Number(btn.dataset.page) });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    $('#order-retry').addEventListener('click', () => this.load());
  }
}

new OrdersPage().init();
