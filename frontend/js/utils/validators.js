/**
 * Validate form phía trình duyệt, cùng cách viết với server/utils/validate.js
 * để quy tắc 2 bên giống nhau. Mỗi rule là hàm (value, data) => chuỗi lỗi | null.
 *
 *   const errors = validate(data, {
 *     email: [rules.required('Vui lòng nhập email'), rules.email()],
 *   });
 *   // -> {} nếu hợp lệ, { email: '...' } nếu có lỗi
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Giá trị rỗng: undefined, null hoặc chuỗi toàn khoảng trắng */
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

  /** Phải trùng với trường khác (vd: nhập lại mật khẩu) */
  matches: (field, msg = 'Giá trị không khớp') => (v, data) =>
    isEmpty(v) || v === data?.[field] ? null : msg,

  /** Checkbox bắt buộc tích (FormData bỏ qua checkbox chưa tích -> undefined) */
  checked: (msg = 'Vui lòng đồng ý để tiếp tục') => (v) => (v ? null : msg),
};

/** Lỗi đầu tiên của 1 trường, không lỗi thì null */
export function validateField(name, data, schema) {
  for (const rule of schema[name] ?? []) {
    const message = rule(data?.[name], data);
    if (message) return message;
  }
  return null;
}

/** Validate toàn bộ, trả về object lỗi theo từng trường (rỗng = hợp lệ) */
export function validate(data, schema) {
  return Object.keys(schema).reduce((errors, name) => {
    const message = validateField(name, data, schema);
    return message ? { ...errors, [name]: message } : errors;
  }, {});
}
