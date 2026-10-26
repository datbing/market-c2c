/**
 * TRANG ĐĂNG TIN: /sell (bắt buộc đăng nhập)
 * TRANG SỬA TIN: /sell?edit=<id> (dùng chung trang, chỉ chủ tin)
 *  - Danh mục (API của mình) + tỉnh thành (API công khai) tải song song bằng Promise.allSettled
 *  - Ảnh: chọn / kéo thả, nén bằng Canvas, xem trước, sắp xếp (components/image-picker.js).
 *    Ảnh chỉ gửi lên server khi bấm "Đăng tin" (1 request FormData).
 *  - Nháp: phần chữ tự lưu vào LocalStorage (listingDraft), F5 không mất. Ảnh không lưu trong nháp.
 *  - Ô giá tự thêm dấu chấm phân cách hàng nghìn khi gõ
 *  - Thẻ xem trước cập nhật trực tiếp theo nội dung đang nhập
 *  - Sửa tin: nạp sẵn dữ liệu + ảnh đã đăng; không dùng nháp; gửi PUT kèm thứ tự ảnh
 */
import { $, debounce } from '../utils/dom.js';
import { rules } from '../utils/validators.js';
import { formatDate } from '../utils/format.js';
import { local } from '../services/storage.js';
import { getCurrentUser, loginUrl } from '../services/auth.js';
import { getCategories, createListing, getListing, updateListing } from '../services/catalog.js';
import { getProvinces } from '../services/public-api.js';
import { setFlash } from '../services/flash.js';
import { initHeader } from '../components/header.js';
import { FormHandler, initCharCounters } from '../components/form.js';
import { ImagePicker } from '../components/image-picker.js';
import { createListingCard } from '../components/listing-card.js';
import { showToast } from '../components/toast.js';

const DRAFT_KEY = 'listingDraft';
const DRAFT_FIELDS = ['title', 'categoryId', 'condition', 'price', 'province', 'description'];
const MAX_PRICE = 2_000_000_000;

// ---------------------------------------------------------
//  Ô giá: chỉ giữ chữ số, hiển thị có dấu chấm "9.500.000"
// ---------------------------------------------------------
const priceDigits = (value = '') => value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');

/** 9500000 -> "khoảng 9,5 triệu đồng" (giúp người bán đỡ gõ nhầm số 0) */
function priceInWords(amount) {
  const units = [
    [1e9, 'tỷ'],
    [1e6, 'triệu'],
    [1e3, 'nghìn'],
  ];
  const unit = units.find(([value]) => amount >= value);
  if (!unit) return amount > 0 ? `${amount} đồng` : '';
  const number = (amount / unit[0]).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
  return `${number} ${unit[1]} đồng`;
}

class SellPage {
  submitted = false;
  categories = new Map();
  /** id tin đang sửa (null = đăng tin mới) */
  editId = null;

  constructor() {
    const edit = new URLSearchParams(window.location.search).get('edit');
    this.editId = /^\d+$/.test(edit ?? '') ? Number(edit) : null;
    this.form = $('#sell-form');
    this.el = {
      category: $('#sell-category'),
      province: $('#sell-province'),
      price: $('#sell-price'),
      priceWords: $('#sell-price-words'),
      draftNotice: $('#draft-notice'),
      preview: $('#sell-preview'),
    };
  }

  async init() {
    // Chưa đăng nhập -> sang trang đăng nhập, xong quay lại đây
    const user = await getCurrentUser().catch(() => null);
    if (!user) {
      window.location.replace(loginUrl());
      return;
    }
    this.user = user;

    initHeader();
    initCharCounters(this.form);
    this.picker = new ImagePicker($('#image-picker'), { max: 6 });
    this.formHandler = this.createFormHandler();

    await this.loadOptions();
    if (this.editId) await this.loadForEdit();
    else this.restoreDraft();
    this.bindEvents();
    this.renderPreview();
  }

  // =======================================================
  //  CHẾ ĐỘ SỬA TIN
  // =======================================================
  async loadForEdit() {
    $('#sell-heading').textContent = 'Sửa tin đăng';
    $('#sell-submit-label').textContent = 'Lưu thay đổi';
    $('#sell-submit-hint').textContent = 'Ảnh mới và ảnh bị xóa chỉ được áp dụng khi bấm Lưu thay đổi.';
    document.title = 'Sửa tin đăng | Market C2C';

    let listing;
    try {
      listing = await getListing(this.editId);
    } catch (err) {
      this.lockForm(err.status === 404 ? 'Không tìm thấy tin đăng cần sửa.' : err.message);
      return;
    }
    if (!listing.isOwner) return this.lockForm('Bạn chỉ được sửa tin của chính mình.');
    if (listing.status === 'sold') {
      return this.lockForm('Tin đã bán không sửa được. Hãy "Đăng bán lại" ở trang Tin đăng của tôi trước.');
    }

    $('#sell-subtitle').textContent =
      listing.status === 'rejected'
        ? `Tin bị từ chối${listing.rejectReason ? ` (${listing.rejectReason})` : ''}. Sửa xong tin sẽ được gửi duyệt lại.`
        : `Đang sửa: ${listing.title}`;

    // Điền dữ liệu cũ vào form
    const set = (name, value) => {
      const field = this.form.elements.namedItem(name);
      field.value = value;
      field.dispatchEvent(new Event('counter:refresh'));
    };
    set('title', listing.title);
    set('description', listing.description);
    set('categoryId', String(listing.category.id));
    set('price', String(listing.price));
    this.formatPrice();

    // Khu vực cũ có thể không có trong danh sách tỉnh mới (vd "TP. Hồ Chí Minh") -> thêm option
    const { province } = this.el;
    if (!province.querySelector(`option[value="${CSS.escape(listing.province)}"]`)) {
      province.add(new Option(listing.province, listing.province), 1);
    }
    province.value = listing.province;

    const radio = this.form.querySelector(`input[name="condition"][value="${CSS.escape(listing.condition)}"]`);
    if (radio) radio.checked = true;

    this.picker.addExisting(listing.images);
  }

  /** Không sửa được (không phải chủ tin, tin đã bán...) -> báo lỗi và khóa form */
  lockForm(message) {
    this.formHandler.showAlert(message);
    this.form.querySelectorAll('input, select, textarea, button').forEach((el) => {
      el.disabled = true;
    });
  }

  // =======================================================
  //  DỮ LIỆU CHỌN: DANH MỤC + TỈNH THÀNH
  // =======================================================
  async loadOptions() {
    const [categories, provinces] = await Promise.allSettled([getCategories(), getProvinces()]);
    const { category, province } = this.el;

    if (categories.status === 'fulfilled') {
      this.categories = new Map(categories.value.map((c) => [String(c.id), c]));
      category.replaceChildren(
        new Option('-- Chọn danh mục --', ''),
        ...categories.value.map((c) => new Option(c.name, c.id)),
      );
      category.disabled = false;
    } else {
      category.replaceChildren(new Option('Không tải được danh mục', ''));
      this.formHandler.setFieldError('categoryId', 'Không tải được danh mục, hãy tải lại trang (F5)');
    }

    if (provinces.status === 'fulfilled') {
      const names = provinces.value.provinces.map((p) => p.name);
      province.replaceChildren(new Option('-- Chọn tỉnh / thành --', ''), ...names.map((n) => new Option(n, n)));
      province.disabled = false;
      // Mặc định theo khu vực trong hồ sơ người dùng (vd "TP. Hồ Chí Minh" khớp "Hồ Chí Minh")
      const mine = names.find((n) => this.user.province?.includes(n));
      if (mine) province.value = mine;
    } else {
      province.replaceChildren(new Option('Không tải được tỉnh thành', ''));
      this.formHandler.setFieldError('province', 'Không tải được danh sách tỉnh thành, hãy tải lại trang');
    }
  }

  // =======================================================
  //  FORM
  // =======================================================
  createFormHandler() {
    return new FormHandler(this.form, {
      schema: {
        images: [() => (this.picker.count === 0 ? 'Vui lòng thêm ít nhất 1 ảnh' : null)],
        title: [
          rules.required('Vui lòng nhập tiêu đề'),
          rules.minLength(10, 'Tiêu đề tối thiểu 10 ký tự'),
          rules.maxLength(150, 'Tiêu đề tối đa 150 ký tự'),
        ],
        categoryId: [rules.required('Vui lòng chọn danh mục')],
        condition: [rules.required('Vui lòng chọn tình trạng')],
        price: [
          rules.required('Vui lòng nhập giá bán'),
          (v) => (Number(priceDigits(v)) > MAX_PRICE ? 'Giá tối đa 2 tỷ đồng' : null),
        ],
        province: [rules.required('Vui lòng chọn khu vực')],
        description: [
          rules.required('Vui lòng nhập mô tả'),
          rules.minLength(20, 'Mô tả tối thiểu 20 ký tự'),
          rules.maxLength(3000, 'Mô tả tối đa 3000 ký tự'),
        ],
      },
      onSubmit: (values) => this.submit(values),
    });
  }

  async submit(values) {
    if (this.picker.isProcessing) throw new Error('Ảnh đang được xử lý, vui lòng đợi trong giây lát');

    const fields = {
      title: values.title,
      categoryId: values.categoryId,
      condition: values.condition,
      price: priceDigits(values.price),
      province: values.province,
      description: values.description,
    };
    const { listing, message } = this.editId
      ? await updateListing(this.editId, fields, this.picker.images)
      : await createListing(fields, this.picker.blobs);

    this.submitted = true; // không hỏi "rời trang?" nữa
    if (!this.editId) local.remove(DRAFT_KEY);
    setFlash(message, 'success');
    window.location.assign(`/product?id=${listing.id}`);
  }

  // =======================================================
  //  NHÁP (LocalStorage) - chỉ phần chữ
  // =======================================================
  saveDraft() {
    if (this.editId) return; // đang sửa tin: không ghi đè nháp của tin mới
    // namedItem('condition') là RadioNodeList -> .value là giá trị radio đang chọn
    const data = Object.fromEntries(
      DRAFT_FIELDS.map((name) => [name, this.form.elements.namedItem(name)?.value ?? '']),
    );

    const hasContent = Object.values(data).some((v) => String(v).trim() !== '');
    if (hasContent) local.set(DRAFT_KEY, { ...data, savedAt: Date.now() });
    else local.remove(DRAFT_KEY);
  }

  restoreDraft() {
    const draft = local.get(DRAFT_KEY);
    if (!draft || typeof draft !== 'object') return;

    DRAFT_FIELDS.forEach((name) => {
      const value = draft[name];
      if (value === undefined || value === '') return;
      if (name === 'condition') {
        const radio = this.form.querySelector(`input[name="condition"][value="${CSS.escape(value)}"]`);
        if (radio) radio.checked = true;
        return;
      }
      const field = this.form.elements.namedItem(name);
      // Danh mục / tỉnh trong nháp có thể không còn trong danh sách -> bỏ qua
      if (field && (field.tagName !== 'SELECT' || field.querySelector(`option[value="${CSS.escape(value)}"]`))) {
        field.value = value;
        field.dispatchEvent(new Event('counter:refresh'));
      }
    });
    this.formatPrice();

    const time = new Date(draft.savedAt);
    $('#draft-time').textContent = `${time.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ${formatDate(time)}`;
    this.el.draftNotice.hidden = false;
  }

  discardDraft() {
    local.remove(DRAFT_KEY);
    this.form.reset();
    this.form.querySelectorAll('[data-counter-for]').forEach((c) => {
      document.getElementById(c.dataset.counterFor)?.dispatchEvent(new Event('counter:refresh'));
    });
    this.formatPrice();
    this.formHandler.showErrors({});
    this.el.draftNotice.hidden = true;
    this.renderPreview();
    showToast('Đã xóa bản nháp', 'info');
  }

  // =======================================================
  //  GIÁ + XEM TRƯỚC
  // =======================================================
  formatPrice() {
    const { price, priceWords } = this.el;
    const digits = priceDigits(price.value).slice(0, 10);
    price.value = digits ? Number(digits).toLocaleString('vi-VN') : '';
    priceWords.textContent = digits ? priceInWords(Number(digits)) : '';
  }

  /** Thẻ tin xem trước: dùng chính component thẻ tin của trang chủ */
  renderPreview() {
    const values = this.formHandler.values();
    const category = this.categories.get(values.categoryId);
    const card = createListingCard({
      id: 0,
      title: values.title || 'Tiêu đề tin đăng của bạn',
      price: Number(priceDigits(values.price)) || 0,
      province: values.province || 'Khu vực',
      condition: values.condition,
      createdAt: new Date().toISOString(),
      thumbnail: this.picker.coverUrl,
      category: { icon: category?.icon ?? 'bi-image' },
    });
    card.inert = true; // chỉ để xem, không bấm/focus được
    this.el.preview.replaceChildren(card);
  }

  bindEvents() {
    const saveDraftLater = debounce(() => this.saveDraft(), 500);
    const previewLater = debounce(() => this.renderPreview(), 200);

    this.el.price.addEventListener('input', () => this.formatPrice());
    this.form.addEventListener('input', () => {
      saveDraftLater();
      previewLater();
    });
    this.form.addEventListener('change', () => {
      saveDraftLater();
      previewLater();
    });
    $('#draft-discard').addEventListener('click', () => this.discardDraft());

    // Ảnh thay đổi -> cập nhật xem trước + bỏ lỗi "chưa có ảnh" nếu đang hiện
    $('#image-picker').addEventListener('images:change', () => {
      previewLater();
      const errorSlot = this.form.querySelector('[data-error-for="images"]');
      if (!errorSlot.hidden && this.picker.count > 0) this.formHandler.setFieldError('images', null);
    });

    // Rời trang khi đã chọn ảnh mà chưa đăng -> trình duyệt hỏi lại (ảnh không lưu trong nháp)
    window.addEventListener('beforeunload', (e) => {
      if (this.picker.hasNewImages && !this.submitted) e.preventDefault();
    });
  }
}

new SellPage().init();
