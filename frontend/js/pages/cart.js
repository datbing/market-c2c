/**
 * CART + CHECKOUT PAGE: /cart
 *  - The cart lives in LocalStorage (services/stores.js). On load -> re-check every item with the server
 *    (Promise.allSettled) to see whether it can still be bought: sold, unavailable, already reserved, your own listing...
 *  - Grouped by seller (reduce), pick items to order, the total is recomputed on every selection
 *  - Shipping details are remembered in LocalStorage (shippingInfo) for the next order
 *  - Checkout: one order per item. Items the server refuses are flagged right in the cart.
 */
import { $, $$ } from '../utils/dom.js';
import { cloneTemplate, fillFields } from '../utils/template.js';
import { formatVND, formatUSD } from '../utils/format.js';
import { rules } from '../utils/validators.js';
import { assetUrl } from '../config.js';
import { local } from '../services/storage.js';
import { cart, toListingSnapshot } from '../services/stores.js';
import { getCurrentUser, loginUrl } from '../services/auth.js';
import { getListing } from '../services/catalog.js';
import { createOrders } from '../services/orders.js';
import { getProvinces, getUsdRate } from '../services/public-api.js';
import { setFlash } from '../services/flash.js';
import { initHeader } from '../components/header.js';
import { FormHandler, initCharCounters } from '../components/form.js';
import { listingUrl } from '../components/listing-card.js';
import { showToast } from '../components/toast.js';

const SHIPPING_KEY = 'shippingInfo';
const PHONE_RE = /^0\d{9}$/;

class CartPage {
  user = null;
  usdRate = null;
  /** Snapshots of the cart items */
  items = [];
  /** id -> { ok: true } | { ok: false, reason } | undefined (checking / could not check) */
  availability = new Map();
  /** ids of the items selected for ordering */
  selected = new Set();

  constructor() {
    this.el = {
      empty: $('#cart-empty'),
      content: $('#cart-content'),
      groups: $('#cart-groups'),
      count: $('#cart-count'),
      selectAll: $('#select-all'),
      selectedCount: $('#summary-count'),
      total: $('#summary-total'),
      totalUsd: $('#summary-usd'),
      submit: $('#checkout-submit'),
      guest: $('#checkout-guest'),
      form: $('#checkout-form'),
      province: $('#checkout-province'),
    };
  }

  async init() {
    initHeader();
    this.user = await getCurrentUser().catch(() => null);
    this.loadItems();
    this.bindEvents();
    if (this.items.length === 0) return;

    // Check the cart + exchange rate + provinces at the same time
    await Promise.all([this.checkAvailability(), this.setupCheckout(), this.loadRate()]);
  }

  loadItems() {
    this.items = cart.getAll();
    // Select every item not flagged as unavailable by default
    this.selected = new Set(
      this.items.filter((item) => this.availability.get(item.id)?.ok !== false).map((item) => item.id),
    );
    this.render();
  }

  async loadRate() {
    this.usdRate = await getUsdRate();
    this.renderSummary();
  }

  // =======================================================
  //  CHECK EACH ITEM'S AVAILABILITY
  // =======================================================
  async checkAvailability() {
    const results = await Promise.allSettled(this.items.map((item) => getListing(item.id)));

    const fresh = new Map();
    results.forEach((result, i) => {
      const { id } = this.items[i];
      if (result.status === 'rejected') {
        // 404: listing deleted / not approved. On network errors let the server check at checkout
        if (result.reason?.status === 404) this.availability.set(id, { ok: false, reason: 'Tin không còn tồn tại' });
        return;
      }
      const l = result.value;
      fresh.set(id, l);
      const reason = l.isOwner
        ? 'Đây là tin của bạn'
        : l.status === 'sold'
          ? 'Món đồ đã được bán'
          : l.status !== 'active'
            ? 'Tin tạm ngừng bán'
            : l.reserved
              ? 'Đã có người khác đặt món này'
              : null;
      this.availability.set(id, reason ? { ok: false, reason } : { ok: true });
    });

    // Write the latest title / price / image back into the cart (keeping order and added time)
    cart.save(cart.getAll().map((item) => (fresh.has(item.id) ? { ...toListingSnapshot(fresh.get(item.id)), savedAt: item.savedAt } : item)));
    // Deselect items that cannot be bought
    this.availability.forEach((value, id) => {
      if (!value.ok) this.selected.delete(id);
    });
    this.items = cart.getAll();
    this.render();
  }

  // =======================================================
  //  RENDER THE CART
  // =======================================================
  render() {
    const hasItems = this.items.length > 0;
    this.el.empty.hidden = hasItems;
    this.el.content.hidden = !hasItems;
    this.el.count.textContent = hasItems ? `(${this.items.length} món)` : '';
    if (!hasItems) return;

    // Group items by seller with reduce: { sellerKey: { name, items: [] } }
    const groups = this.items.reduce((acc, item) => {
      const key = item.sellerId ?? 'unknown';
      acc[key] ??= { name: item.sellerName ?? 'Người bán', items: [] };
      acc[key].items.push(item);
      return acc;
    }, {});

    this.el.groups.replaceChildren(
      ...Object.values(groups).map((group) => {
        const section = cloneTemplate('tpl-cart-group');
        fillFields(section, { seller: group.name });
        section.querySelector('.cart-group__items').append(...group.items.map((item) => this.createItem(item)));
        return section;
      }),
    );
    this.renderSummary();
  }

  createItem(item) {
    const li = cloneTemplate('tpl-cart-item');
    li.dataset.id = item.id;
    fillFields(li, { title: item.title, province: item.province ?? '', price: formatVND(item.price) });

    li.querySelectorAll('a').forEach((a) => {
      a.href = listingUrl(item.id);
    });
    if (item.thumbnail) {
      const img = li.querySelector('img');
      img.src = assetUrl(item.thumbnail);
      img.alt = item.title;
      img.hidden = false;
      li.querySelector('.cart-item__placeholder').hidden = true;
    } else if (item.categoryIcon) {
      li.querySelector('.cart-item__placeholder .bi').className = `bi ${item.categoryIcon}`;
    }

    const check = li.querySelector('.cart-item__check');
    const status = this.availability.get(item.id);
    check.checked = this.selected.has(item.id);
    check.setAttribute('aria-label', `Chọn "${item.title}"`);

    if (status && !status.ok) {
      li.classList.add('is-unavailable');
      check.disabled = true;
      const problem = li.querySelector('.cart-item__problem');
      problem.textContent = status.reason;
      problem.hidden = false;
    }
    return li;
  }

  /** Total + number of selected items (only items that can be bought) */
  renderSummary() {
    const chosen = this.items.filter((item) => this.selected.has(item.id));
    const total = chosen.reduce((sum, item) => sum + Number(item.price), 0);
    const selectable = this.items.filter((item) => this.availability.get(item.id)?.ok !== false);

    this.el.selectedCount.textContent = chosen.length;
    this.el.total.textContent = formatVND(total);
    this.el.totalUsd.textContent = formatUSD(total, this.usdRate);
    this.el.submit.querySelector('[data-submit-count]').textContent = chosen.length;
    this.el.submit.disabled = chosen.length === 0;

    this.el.selectAll.checked = selectable.length > 0 && chosen.length === selectable.length;
    this.el.selectAll.indeterminate = chosen.length > 0 && chosen.length < selectable.length;
    this.el.selectAll.disabled = selectable.length === 0;

    // Guest: hide the shipping form, replace the order button with a login link
    $('#checkout').hidden = !this.user;
    this.el.submit.hidden = !this.user;
    this.el.guest.hidden = Boolean(this.user);
    this.el.guest.href = loginUrl();
  }

  // =======================================================
  //  SHIPPING DETAILS + CHECKOUT
  // =======================================================
  async setupCheckout() {
    initCharCounters(this.el.form);
    this.formHandler = new FormHandler(this.el.form, {
      schema: {
        receiverName: [rules.required('Vui lòng nhập tên người nhận'), rules.minLength(2), rules.maxLength(100)],
        receiverPhone: [
          rules.required('Vui lòng nhập số điện thoại'),
          rules.pattern(PHONE_RE, 'Số điện thoại gồm 10 số và bắt đầu bằng 0'),
        ],
        province: [rules.required('Vui lòng chọn tỉnh / thành')],
        address: [rules.required('Vui lòng nhập địa chỉ'), rules.minLength(5, 'Địa chỉ quá ngắn'), rules.maxLength(255)],
        note: [rules.maxLength(500, 'Ghi chú tối đa 500 ký tự')],
      },
      onSubmit: (values) => this.checkout(values),
    });
    // The "Order" button sits outside the form (in the summary column, using the HTML5 form="checkout-form" attribute)
    this.formHandler.submitButton = this.el.submit;

    // Provinces (public API, with a fallback)
    try {
      const { provinces } = await getProvinces();
      this.el.province.replaceChildren(
        new Option('-- Chọn tỉnh / thành --', ''),
        ...provinces.map((p) => new Option(p.name, p.name)),
      );
      this.el.province.disabled = false;
    } catch {
      this.el.province.replaceChildren(new Option('Không tải được tỉnh thành', ''));
    }

    // Prefill: previous order (LocalStorage) > user profile
    const saved = local.get(SHIPPING_KEY) ?? {};
    const defaults = {
      receiverName: saved.receiverName ?? this.user?.name ?? '',
      receiverPhone: saved.receiverPhone ?? this.user?.phone ?? '',
      address: saved.address ?? '',
      province:
        saved.province ??
        [...this.el.province.options].find((o) => o.value && this.user?.province?.includes(o.value))?.value ??
        '',
    };
    Object.entries(defaults).forEach(([name, value]) => {
      const field = this.el.form.elements.namedItem(name);
      if (field && value) field.value = value;
    });
  }

  async checkout(values) {
    const listingIds = this.items.filter((item) => this.selected.has(item.id)).map((item) => item.id);
    if (listingIds.length === 0) throw new Error('Vui lòng chọn ít nhất 1 món để đặt');

    const receiver = {
      receiverName: values.receiverName,
      receiverPhone: values.receiverPhone,
      address: values.address,
      province: values.province,
      note: values.note,
    };

    try {
      const { message } = await createOrders(listingIds, receiver);
      // Ordered: remove the ordered items from the cart, remember the shipping details
      listingIds.forEach((id) => cart.remove(id));
      const { note, ...shipping } = receiver;
      local.set(SHIPPING_KEY, shipping);
      setFlash(message, 'success');
      window.location.assign('/orders?role=buyer');
    } catch (err) {
      // 409: the server says which items could not be ordered -> flag them in the cart
      const problems = err.errors?.items;
      if (Array.isArray(problems)) {
        problems.forEach(({ listingId, reason }) => {
          this.availability.set(listingId, { ok: false, reason });
          this.selected.delete(listingId);
        });
        this.render();
      }
      throw err; // FormHandler shows the general message
    }
  }

  // =======================================================
  //  EVENTS
  // =======================================================
  bindEvents() {
    // Select / deselect / remove each item (event delegation)
    this.el.groups.addEventListener('change', (e) => {
      const check = e.target.closest('.cart-item__check');
      if (!check) return;
      const id = Number(check.closest('[data-id]').dataset.id);
      if (check.checked) this.selected.add(id);
      else this.selected.delete(id);
      this.renderSummary();
    });

    this.el.groups.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="remove"]');
      if (!btn) return;
      const id = Number(btn.closest('[data-id]').dataset.id);
      this.selected.delete(id);
      cart.remove(id); // dispatches 'cart:change' -> re-rendered by the listener below
      showToast('Đã xóa khỏi giỏ hàng', 'info');
    });

    this.el.selectAll.addEventListener('change', () => {
      this.selected = new Set(
        this.el.selectAll.checked
          ? this.items.filter((item) => this.availability.get(item.id)?.ok !== false).map((item) => item.id)
          : [],
      );
      $$('.cart-item__check:not(:disabled)', this.el.groups).forEach((c) => {
        c.checked = this.el.selectAll.checked;
      });
      this.renderSummary();
    });

    // Cart changed (item removed, another tab added one...) -> re-render
    window.addEventListener('cart:change', () => {
      const ids = new Set(cart.getAll().map((item) => item.id));
      this.selected = new Set([...this.selected].filter((id) => ids.has(id)));
      this.items = cart.getAll();
      this.render();
    });
  }
}

new CartPage().init();
