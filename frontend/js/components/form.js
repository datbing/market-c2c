/**
 * FormHandler: gắn hành vi cho một <form> viết sẵn trong HTML.
 *  - Validate khi rời ô (blur) và khi gõ lại vào ô đang báo lỗi
 *  - Submit: validate toàn bộ -> lỗi thì focus ô sai đầu tiên; hợp lệ thì gọi onSubmit
 *  - Lỗi từ server (ApiError.errors) hiện vào đúng ô, message chung hiện ở khung cảnh báo
 *  - Khóa nút submit + hiện vòng xoay khi đang gửi (chống bấm 2 lần)
 *
 * Quy ước HTML:
 *   <input name="email" aria-describedby="...">        ô nhập
 *   <p data-error-for="email" hidden></p>               chỗ hiện lỗi của ô
 *   <div data-form-alert hidden><span data-alert-message></span></div>  cảnh báo chung
 *   <button type="submit" data-submit>                  nút gửi
 */
import { validate, validateField } from '../utils/validators.js';

export class FormHandler {
  /** Các trường đã được người dùng chạm vào (chỉ báo lỗi sau khi rời ô lần đầu) */
  #touched = new Set();

  /**
   * @param {HTMLFormElement} form
   * @param {object} options
   * @param {object} options.schema  { tênTrường: [rule, ...] }
   * @param {(values: object) => Promise<void>} options.onSubmit
   * @param {HTMLElement} [options.alert]  khung cảnh báo chung (mặc định tìm [data-form-alert])
   */
  constructor(form, { schema, onSubmit, alert }) {
    this.form = form;
    this.schema = schema;
    this.onSubmit = onSubmit;
    this.alert = alert ?? document.querySelector('[data-form-alert]');
    this.submitButton = form.querySelector('[data-submit]');

    form.noValidate = true; // tắt bong bóng lỗi mặc định, dùng giao diện riêng
    form.addEventListener('submit', (e) => this.#handleSubmit(e));
    form.addEventListener('focusout', (e) => this.#handleBlur(e));
    form.addEventListener('input', (e) => this.#handleInput(e));
  }

  /** Lấy dữ liệu form thành object, chuỗi được trim (riêng mật khẩu giữ nguyên) */
  values() {
    const data = {};
    for (const [key, value] of new FormData(this.form)) {
      data[key] = typeof value === 'string' && !/password/i.test(key) ? value.trim() : value;
    }
    return data;
  }

  // ---------------------------------------------------------
  //  Hiển thị lỗi
  // ---------------------------------------------------------
  setFieldError(name, message) {
    const input = this.form.elements.namedItem(name);
    const slot = this.form.querySelector(`[data-error-for="${name}"]`);
    if (input && 'setAttribute' in input) {
      input.classList.toggle('is-invalid', Boolean(message));
      input.setAttribute('aria-invalid', String(Boolean(message)));
    }
    if (slot) {
      slot.textContent = message ?? '';
      slot.hidden = !message;
    }
  }

  /** Hiện nhiều lỗi cùng lúc, focus vào ô sai đầu tiên theo thứ tự trong form */
  showErrors(errors = {}) {
    Object.keys(this.schema).forEach((name) => this.setFieldError(name, errors[name] ?? null));
    Object.entries(errors).forEach(([name, message]) => this.setFieldError(name, message));

    const firstInvalid = this.form.querySelector('.is-invalid');
    firstInvalid?.focus();
  }

  showAlert(message, type = 'error') {
    if (!this.alert) return;
    this.alert.className = `alert alert--${type}`;
    this.alert.querySelector('[data-alert-message]').textContent = message;
    this.alert.hidden = false;
  }

  hideAlert() {
    if (this.alert) this.alert.hidden = true;
  }

  setLoading(loading) {
    if (!this.submitButton) return;
    this.submitButton.disabled = loading;
    this.submitButton.classList.toggle('is-loading', loading);
    this.submitButton.setAttribute('aria-busy', String(loading));
  }

  // ---------------------------------------------------------
  //  Sự kiện
  // ---------------------------------------------------------
  #validateOne(name) {
    if (!(name in this.schema)) return;
    this.setFieldError(name, validateField(name, this.values(), this.schema));
  }

  #handleBlur(e) {
    const { name } = e.target;
    if (!name || !(name in this.schema)) return;
    this.#touched.add(name);
    this.#validateOne(name);
  }

  #handleInput(e) {
    const { name, type } = e.target;
    if (!name) return;
    // Checkbox / ô đã từng rời khỏi: kiểm tra lại ngay khi thay đổi
    if (type === 'checkbox' || this.#touched.has(name)) this.#validateOne(name);

    // Đổi mật khẩu thì ô "nhập lại" (nếu đã chạm) cũng phải kiểm tra lại
    if (name === 'password' && this.#touched.has('confirmPassword')) this.#validateOne('confirmPassword');
  }

  async #handleSubmit(e) {
    e.preventDefault();
    this.hideAlert();

    const values = this.values();
    const errors = validate(values, this.schema);
    Object.keys(this.schema).forEach((name) => this.#touched.add(name));

    if (Object.keys(errors).length > 0) {
      this.showErrors(errors);
      return;
    }
    this.showErrors({});

    this.setLoading(true);
    try {
      await this.onSubmit(values);
    } catch (err) {
      // ApiError từ services/api.js: có message chung + errors theo trường (422/409)
      if (err.errors) this.showErrors(err.errors);
      this.showAlert(err.message || 'Có lỗi xảy ra, vui lòng thử lại');
    } finally {
      this.setLoading(false);
    }
  }
}
