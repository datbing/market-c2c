/**
 * Browser-side form validation, written the same way as server/utils/validate.js
 * so both sides share the same rules. Each rule is a function (value, data) => error string | null.
 *
 *   const errors = validate(data, {
 *     email: [rules.required('Vui lòng nhập email'), rules.email()],
 *   });
 *   // -> {} when valid, { email: '...' } when there are errors
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Empty value: undefined, null or a whitespace-only string */
const isEmpty = (v) => v === undefined || v === null || String(v).trim() === '';

export const rules = {
  required: (msg = 'Trường này là bắt buộc') => (v) => (isEmpty(v) ? msg : null),

  minLength: (n, msg) => (v) =>
    isEmpty(v) || String(v).trim().length >= n ? null : msg ?? `Tối thiểu ${n} ký tự`,

  maxLength: (n, msg) => (v) =>
    isEmpty(v) || String(v).trim().length <= n ? null : msg ?? `Tối đa ${n} ký tự`,

  email: (msg = 'Email không hợp lệ') => (v) =>
    isEmpty(v) || EMAIL_RE.test(String(v).trim()) ? null : msg,

  pattern: (re, msg = 'Sai định dạng') => (v) =>
    isEmpty(v) || re.test(String(v).trim()) ? null : msg,

  /** Must equal another field (e.g. password confirmation) */
  matches: (field, msg = 'Giá trị không khớp') => (v, data) =>
    isEmpty(v) || v === data?.[field] ? null : msg,

  /** Checkbox that must be checked (FormData skips unchecked checkboxes -> undefined) */
  checked: (msg = 'Vui lòng đồng ý để tiếp tục') => (v) => (v ? null : msg),
};

/** First error of a field, null if none */
export function validateField(name, data, schema) {
  for (const rule of schema[name] ?? []) {
    const message = rule(data?.[name], data);
    if (message) return message;
  }
  return null;
}

/** Validate everything, returns an object of errors per field (empty = valid) */
export function validate(data, schema) {
  return Object.keys(schema).reduce((errors, name) => {
    const message = validateField(name, data, schema);
    return message ? { ...errors, [name]: message } : errors;
  }, {});
}
