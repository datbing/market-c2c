/**
 * TRANG GIỎ HÀNG + ĐẶT HÀNG: /cart
 *  - Giỏ lưu ở LocalStorage (services/stores.js). Mở trang -> hỏi lại server từng món
 *    (Promise.allSettled) xem còn mua được không: đã bán, ngừng bán, đã có người đặt, tin của mình...
 *  - Nhóm theo người bán (reduce), chọn món để đặt, tổng tiền tính lại mỗi lần chọn
 *  - Thông tin nhận hàng nhớ trong LocalStorage (shippingInfo) cho lần đặt sau
 *  - Đặt hàng: mỗi món -> 1 đơn. Món nào server từ chối thì đánh dấu ngay trên giỏ.
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
  /** Snapshot các món trong giỏ */
  items = [];
  /** id -> { ok: true } | { ok: false, reason } | undefined (đang kiểm tra / không kiểm tra được) */
  availability = new Map();
  /** id các món đang được chọn để đặt */
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

    // Kiểm tra giỏ + tỷ giá + tỉnh thành cùng lúc
    await Promise.all([this.checkAvailability(), this.setupCheckout(), this.loadRate()]);
  }

  loadItems() {
    this.items = cart.getAll();
    // Mặc định chọn hết các món chưa bị đánh dấu không mua được
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
  //  KIỂM TRA TÌNH TRẠNG TỪNG MÓN
  // =======================================================
  async checkAvailability() {
    const results = await Promise.allSettled(this.items.map((item) => getListing(item.id)));

    const fresh = new Map();
    results.forEach((result, i) => {
      const { id } = this.items[i];
      if (result.status === 'rejected') {
        // 404: tin đã xóa / chưa duyệt. Lỗi mạng thì để server kiểm tra lúc đặt
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

    // Cập nhật lại tiêu đề / giá / ảnh mới nhất vào giỏ (giữ nguyên thứ tự và thời điểm thêm)
    cart.save(cart.getAll().map((item) => (fresh.has(item.id) ? { ...toListingSnapshot(fresh.get(item.id)), savedAt: item.savedAt } : item)));
    // Bỏ chọn món không mua được
    this.availability.forEach((value, id) => {
      if (!value.ok) this.selected.delete(id);
    });
    this.items = cart.getAll();
    this.render();
  }

  // =======================================================
  //  HIỂN THỊ GIỎ
  // =======================================================
  render() {
    const hasItems = this.items.length > 0;
    this.el.empty.hidden = hasItems;
    this.el.content.hidden = !hasItems;
    this.el.count.textContent = hasItems ? `(${this.items.length} món)` : '';
    if (!hasItems) return;

    // Gom món theo người bán bằng reduce: { sellerKey: { name, items: [] } }
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

  /** Tổng tiền + số món đã chọn (chỉ tính món mua được) */
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

    // Khách: ẩn form nhận hàng, thay nút đặt hàng bằng link đăng nhập
    $('#checkout').hidden = !this.user;
    this.el.submit.hidden = !this.user;
    this.el.guest.hidden = Boolean(this.user);
    this.el.guest.href = loginUrl();
  }

  // =======================================================
  //  THÔNG TIN NHẬN HÀNG + ĐẶT HÀNG
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
    // Nút "Đặt hàng" nằm ngoài form (ở cột tóm tắt, dùng thuộc tính form="checkout-form" của HTML5)
    this.formHandler.submitButton = this.el.submit;

    // Tỉnh thành (API công khai, có dự phòng)
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

    // Điền sẵn: lần đặt trước (LocalStorage) > hồ sơ người dùng
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
      // Đặt xong: bỏ các món đã đặt khỏi giỏ, nhớ thông tin nhận hàng
      listingIds.forEach((id) => cart.remove(id));
      const { note, ...shipping } = receiver;
      local.set(SHIPPING_KEY, shipping);
      setFlash(message, 'success');
      window.location.assign('/orders?role=buyer');
    } catch (err) {
      // 409: server báo món nào không đặt được -> đánh dấu ngay trên giỏ
      const problems = err.errors?.items;
      if (Array.isArray(problems)) {
        problems.forEach(({ listingId, reason }) => {
          this.availability.set(listingId, { ok: false, reason });
          this.selected.delete(listingId);
        });
        this.render();
      }
      throw err; // FormHandler hiện thông báo chung
    }
  }

  // =======================================================
  //  SỰ KIỆN
  // =======================================================
  bindEvents() {
    // Chọn / bỏ chọn / xóa từng món (event delegation)
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
      cart.remove(id); // phát 'cart:change' -> render lại ở listener bên dưới
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

    // Giỏ đổi (xóa món, tab khác thêm món...) -> vẽ lại
    window.addEventListener('cart:change', () => {
      const ids = new Set(cart.getAll().map((item) => item.id));
      this.selected = new Set([...this.selected].filter((id) => ids.has(id)));
      this.items = cart.getAll();
      this.render();
    });
  }
}

new CartPage().init();
