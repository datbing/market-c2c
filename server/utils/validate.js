/**
 * Bộ validate đơn giản, không cần thư viện ngoài.
 * Mỗi rule là một hàm (value, data) => chuỗi lỗi | null.
 *
 * Ví dụ:
 *   validate(req.body, {
 *     email: [rules.required(), rules.email()],
 *     price: [rules.required(), rules.integer(), rules.min(0)],
 *   });
 */
import { HttpError } from './HttpError.js';

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

  integer: (msg = 'Phải là số nguyên') => (v) =>
    isEmpty(v) || Number.isInteger(Number(v)) ? null : msg,

  min: (n, msg) => (v) => (isEmpty(v) || Number(v) >= n ? null : msg ?? `Giá trị tối thiểu là ${n}`),

  max: (n, msg) => (v) => (isEmpty(v) || Number(v) <= n ? null : msg ?? `Giá trị tối đa là ${n}`),

  oneOf: (list, msg = 'Giá trị không hợp lệ') => (v) =>
    isEmpty(v) || list.includes(String(v)) ? null : msg,
};

/**
 * Validate object dữ liệu theo schema. Mỗi trường dừng ở lỗi đầu tiên.
 * Có lỗi -> ném HttpError 422 kèm object `errors` để frontend hiện dưới từng ô input.
 */
export function validate(data, schema) {
  const errors = {};

  for (const [field, fieldRules] of Object.entries(schema)) {
    for (const rule of fieldRules) {
      const message = rule(data?.[field], data);
      if (message) {
        errors[field] = message;
        break;
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    throw HttpError.unprocessable(errors);
  }
}
