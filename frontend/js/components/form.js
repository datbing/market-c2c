/**
 * FormHandler: adds behavior to a <form> written in the HTML.
 *  - Validates on blur and while retyping into a field that shows an error
 *  - Submit: validates everything -> on error focus the first invalid field; if valid call onSubmit
 *  - Server errors (ApiError.errors) go to the matching field, the general message goes to the alert box
 *  - Disables the submit button + shows a spinner while sending (prevents double submits)
 *
 * HTML conventions:
 *   <input name="email" aria-describedby="...">        input field
 *   <p data-error-for="email" hidden></p>               where the field's error is shown
 *   <div data-form-alert hidden><span data-alert-message></span></div>  general alert
 *   <button type="submit" data-submit>                  submit button
 */
import { validate, validateField } from '../utils/validators.js';

export class FormHandler {
  /** Fields the user has touched (errors only show after leaving a field once) */
  #touched = new Set();

  /**
   * @param {HTMLFormElement} form
   * @param {object} options
   * @param {object} options.schema  { fieldName: [rule, ...] }
   * @param {(values: object) => Promise<void>} options.onSubmit
   * @param {HTMLElement} [options.alert]  general alert box (defaults to [data-form-alert])
   */
  constructor(form, { schema, onSubmit, alert }) {
    this.form = form;
    this.schema = schema;
    this.onSubmit = onSubmit;
    this.alert = alert ?? document.querySelector('[data-form-alert]');
    this.submitButton = form.querySelector('[data-submit]');

    form.noValidate = true; // disable the default error bubbles, use our own UI
    form.addEventListener('submit', (e) => this.#handleSubmit(e));
    form.addEventListener('focusout', (e) => this.#handleBlur(e));
    form.addEventListener('input', (e) => this.#handleInput(e));
    // <select>, radio and checkbox report changes via "change" -> revalidate right away
    form.addEventListener('change', (e) => this.#handleInput(e));
  }

  /** Read the form into an object, strings are trimmed (passwords are kept as is) */
  values() {
    const data = {};
    for (const [key, value] of new FormData(this.form)) {
      data[key] = typeof value === 'string' && !/password/i.test(key) ? value.trim() : value;
    }
    return data;
  }

  // ---------------------------------------------------------
  //  Showing errors
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

  /** Show several errors at once, focus the first invalid field in form order */
  showErrors(errors = {}) {
    Object.keys(this.schema).forEach((name) => this.setFieldError(name, errors[name] ?? null));
    Object.entries(errors).forEach(([name, message]) => this.setFieldError(name, message));

    const firstInvalid = this.form.querySelector('.is-invalid');
    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }
    // Error not tied to an input (e.g. no image selected) -> scroll to the error line
    this.form.querySelector('[data-error-for]:not([hidden])')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
  //  Events
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
    // Choice inputs (checkbox, radio, select) or fields already left once: revalidate on every change
    const isChoice = type === 'checkbox' || type === 'radio' || e.target.tagName === 'SELECT';
    if (isChoice || this.#touched.has(name)) this.#validateOne(name);

    // Changing the password also revalidates the "confirm" field (if touched)
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
      // ApiError from services/api.js: a general message + per-field errors (422/409)
      if (err.errors) this.showErrors(err.errors);
      this.showAlert(err.message || 'Có lỗi xảy ra, vui lòng thử lại');
    } finally {
      this.setLoading(false);
    }
  }
}

/**
 * Character counter: <span data-counter-for="input-id"></span> -> "23/150".
 * The limit comes from the input's maxlength attribute; the color changes near the limit.
 */
export function initCharCounters(root = document) {
  root.querySelectorAll('[data-counter-for]').forEach((counter) => {
    const input = document.getElementById(counter.dataset.counterFor);
    const max = Number(input.maxLength) > 0 ? Number(input.maxLength) : null;

    const update = () => {
      const length = input.value.length;
      counter.textContent = max ? `${length}/${max}` : String(length);
      counter.classList.toggle('is-near-limit', Boolean(max) && length >= max * 0.9);
    };
    input.addEventListener('input', update);
    update();
    // Lets other code (e.g. draft restore) trigger it after changing the input value
    input.addEventListener('counter:refresh', update);
  });
}
