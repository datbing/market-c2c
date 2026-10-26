/**
 * POST A LISTING PAGE: /sell (login required)
 * EDIT A LISTING PAGE: /sell?edit=<id> (same page, owner only)
 *  - Categories (our API) + provinces (public API) load in parallel with Promise.allSettled
 *  - Images: pick / drag and drop, compress with Canvas, preview, reorder (components/image-picker.js).
 *    Images are only sent to the server when "Post" is clicked (one FormData request).
 *  - Draft: the text fields are saved to LocalStorage (listingDraft) automatically, F5 keeps them. Images are not part of the draft.
 *  - The price field adds thousands separators (dots) while typing
 *  - The preview card updates live from the form contents
 *  - Edit: preloads the data + existing images; no draft; sends PUT with the image order
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
//  Price field: keep digits only, display with dots "9.500.000"
// ---------------------------------------------------------
const priceDigits = (value = '') => value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');

/** 9500000 -> "khoảng 9,5 triệu đồng" (helps sellers avoid typing a wrong number of zeros) */
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
  /** id of the listing being edited (null = new listing) */
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
    // Not logged in -> go to the login page, then come back here
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
  //  EDIT MODE
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

    // Fill the form with the existing data
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

    // The old area may not be in the new province list (e.g. "TP. Hồ Chí Minh") -> add an option
    const { province } = this.el;
    if (!province.querySelector(`option[value="${CSS.escape(listing.province)}"]`)) {
      province.add(new Option(listing.province, listing.province), 1);
    }
    province.value = listing.province;

    const radio = this.form.querySelector(`input[name="condition"][value="${CSS.escape(listing.condition)}"]`);
    if (radio) radio.checked = true;

    this.picker.addExisting(listing.images);
  }

  /** Cannot edit (not the owner, listing sold...) -> show an error and lock the form */
  lockForm(message) {
    this.formHandler.showAlert(message);
    this.form.querySelectorAll('input, select, textarea, button').forEach((el) => {
      el.disabled = true;
    });
  }

  // =======================================================
  //  CHOICE DATA: CATEGORIES + PROVINCES
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
      // Default to the area in the user's profile (e.g. "TP. Hồ Chí Minh" matches "Hồ Chí Minh")
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

    this.submitted = true; // no more "leave page?" prompt
    if (!this.editId) local.remove(DRAFT_KEY);
    setFlash(message, 'success');
    window.location.assign(`/product?id=${listing.id}`);
  }

  // =======================================================
  //  DRAFT (LocalStorage) - text fields only
  // =======================================================
  saveDraft() {
    if (this.editId) return; // editing: do not overwrite the new-listing draft
    // namedItem('condition') is a RadioNodeList -> .value is the selected radio's value
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
      // The draft's category / province may no longer be in the list -> skip it
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
  //  PRICE + PREVIEW
  // =======================================================
  formatPrice() {
    const { price, priceWords } = this.el;
    const digits = priceDigits(price.value).slice(0, 10);
    price.value = digits ? Number(digits).toLocaleString('vi-VN') : '';
    priceWords.textContent = digits ? priceInWords(Number(digits)) : '';
  }

  /** Preview card: reuses the home page's listing card component */
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
    card.inert = true; // display only, cannot be clicked/focused
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

    // Images changed -> update the preview + clear the "no images" error if shown
    $('#image-picker').addEventListener('images:change', () => {
      previewLater();
      const errorSlot = this.form.querySelector('[data-error-for="images"]');
      if (!errorSlot.hidden && this.picker.count > 0) this.formHandler.setFieldError('images', null);
    });

    // Leaving with picked but unposted images -> the browser asks for confirmation (images are not in the draft)
    window.addEventListener('beforeunload', (e) => {
      if (this.picker.hasNewImages && !this.submitted) e.preventDefault();
    });
  }
}

new SellPage().init();
