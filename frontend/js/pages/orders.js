/**
 * ORDERS PAGE: /orders?role=buyer|seller&status=&page= (login required)
 *  - "Purchases" / "Sales" tabs + status tabs with counts (shared logic in components/list-page.js)
 *  - Progress bar: Pending -> Confirmed -> Shipping -> Completed (drawn by CSS from classes)
 *  - Action buttons by role + status (matches TRANSITIONS in server/controllers/order.controller.js):
 *      seller: confirm, ship, complete, cancel
 *      buyer: cancel (while pending), received (while shipping)
 *  - Completing an order -> the listing automatically becomes "Sold" (the assignment's "mark as completed")
 */
import { $, $$ } from '../utils/dom.js';
import { cloneTemplate, fillFields } from '../utils/template.js';
import { formatVND, formatDate, timeAgo, ORDER_STATUS_LABELS } from '../utils/format.js';
import { assetUrl } from '../config.js';
import { getCurrentUser, loginUrl } from '../services/auth.js';
import { getOrders, updateOrderStatus } from '../services/orders.js';
import { initHeader, showOrderBadge } from '../components/header.js';
import { confirmDialog } from '../components/confirm-dialog.js';
import { listingUrl } from '../components/listing-card.js';
import { ListPage } from '../components/list-page.js';

const STEPS = ['pending', 'confirmed', 'shipping', 'completed'];

/** Buttons shown for each role + order status */
const ACTIONS = {
  seller: { pending: ['confirm', 'cancel'], confirmed: ['ship', 'cancel'], shipping: ['complete'] },
  buyer: { pending: ['cancel'], shipping: ['received'] },
};

/** Button -> new status + confirmation dialog (if needed) */
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

class OrdersPage extends ListPage {
  defaults = { role: 'buyer', status: '', page: 1 };

  constructor() {
    super({
      list: '#order-list',
      loading: '#order-loading',
      empty: '#order-empty',
      error: '#order-error',
      errorMessage: '#order-error-message',
      retry: '#order-retry',
      pagination: '#pagination',
      tabs: '#status-tabs',
      roleTabs: '#role-tabs',
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
      role: params.get('role') === 'seller' ? 'seller' : 'buyer',
      status: status in ORDER_STATUS_LABELS ? status : '',
      page: ListPage.readPage(params),
    };
  }

  fetchPage(params, signal) {
    this.renderRoleTabs(); // switch the Purchases / Sales tab right away, before the data arrives
    return getOrders(params, signal);
  }

  /** Red number on the Purchases / Sales tabs = orders waiting for you */
  onData({ needAction = {} }) {
    $$('[data-role-tab]', this.el.roleTabs).forEach((tab) => {
      const n = needAction[tab.dataset.roleTab] ?? 0;
      const badge = tab.querySelector('[data-role-badge]');
      badge.textContent = n;
      badge.hidden = n === 0;
      badge.title = `${n} đơn cần bạn xử lý`;
    });
  }

  renderRoleTabs() {
    $$('[data-role-tab]', this.el.roleTabs).forEach((tab) => {
      const active = tab.dataset.roleTab === this.filters.role;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-pressed', String(active));
    });
  }

  renderEmpty() {
    const { status, role } = this.filters;
    $('#order-empty-text').textContent = status
      ? `Không có đơn nào "${ORDER_STATUS_LABELS[status]}".`
      : EMPTY_TEXTS[role];
  }

  createItem(order) {
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

    // Contact: the other party's phone number (call directly via a tel: link)
    const phone = isSeller ? order.receiver.phone : party.phone;
    const phoneLink = card.querySelector('[data-field="partyPhone"]');
    phoneLink.hidden = !phone;
    if (phone) {
      phoneLink.textContent = phone;
      phoneLink.href = `tel:${phone}`;
    }

    // Image + link to the listing
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

    // Buttons by role + status
    const allowed = new Set(ACTIONS[order.myRole]?.[order.status] ?? []);
    card.querySelectorAll('[data-action]').forEach((btn) => {
      btn.hidden = !allowed.has(btn.dataset.action);
    });
    card.querySelector('.order-card__actions').hidden = allowed.size === 0;
    return card;
  }

  /** Progress bar: past steps = is-done, current step = is-current */
  renderSteps(card, status) {
    if (status === 'cancelled') {
      card.querySelector('.order-steps').hidden = true;
      card.querySelector('.order-card__cancelled').hidden = false;
      return;
    }
    const current = STEPS.indexOf(status);
    card.querySelectorAll('.order-steps [data-step]').forEach((li) => {
      const index = STEPS.indexOf(li.dataset.step);
      li.classList.toggle('is-done', index < current || status === 'completed');
      li.classList.toggle('is-current', index === current && status !== 'completed');
      if (index === current) li.setAttribute('aria-current', 'step');
    });
  }

  async handleAction(order, action, button) {
    const { status, confirm } = ACTION_CONFIG[action];
    if (confirm && !(await confirmDialog(confirm))) return;
    const ok = await this.runTask(button, async () => (await updateOrderStatus(order.id, status)).message);
    if (ok) showOrderBadge(); // update the orders-needing-action count in the header
  }

  bindEvents() {
    super.bindEvents();
    this.el.roleTabs.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-role-tab]');
      if (tab && tab.dataset.roleTab !== this.filters.role) this.setFilters({ role: tab.dataset.roleTab, status: '' });
    });
  }
}

new OrdersPage().init();
