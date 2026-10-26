/**
 * Wrapper cho Fetch API: mọi request tới backend đều đi qua đây.
 *  - Tự gắn query string (bỏ qua giá trị rỗng)
 *  - Tự gửi JSON hoặc FormData (upload ảnh)
 *  - Parse JSON, nếu lỗi thì ném ApiError có `message`, `status`, `errors` (lỗi từng trường)
 *  - Hỗ trợ AbortController (`signal`) để hủy request cũ khi người dùng lọc liên tục
 *  - Backend chạy ở server riêng (API_BASE), gửi kèm cookie session qua CORS
 */
import { API_BASE } from '../config.js';

export class ApiError extends Error {
  constructor(message, { status = 0, errors = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
  }
}

/** Kiểm tra lỗi do chủ động hủy request (không cần báo cho người dùng) */
export const isAbortError = (err) => err?.name === 'AbortError';

/** Tạo URL kèm query string, bỏ qua các tham số undefined/null/'' */
function buildUrl(path, params) {
  const url = new URL(path, API_BASE);
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });
  return url;
}

/**
 * Gửi request và trả về toàn bộ body JSON: { success, data, message?, meta? }
 * @param {string} path  vd: '/api/listings'
 * @param {object} [options]
 */
export async function request(path, { method = 'GET', params, body, signal } = {}) {
  const options = {
    method,
    headers: { Accept: 'application/json' },
    credentials: 'include', // khác origin -> phải 'include' thì mới gửi/nhận cookie session
    signal,
  };

  if (body instanceof FormData) {
    options.body = body; // trình duyệt tự đặt Content-Type multipart kèm boundary
  } else if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(buildUrl(path, params), options);
  } catch (err) {
    if (isAbortError(err)) throw err;
    // fetch chỉ reject khi lỗi mạng / server API chưa chạy / bị chặn CORS
    throw new ApiError('Không kết nối được máy chủ API. Vui lòng kiểm tra mạng và thử lại.');
  }

  // Server có thể trả HTML (vd: lỗi proxy) -> không parse được JSON
  const json = await response.json().catch(() => null);

  if (!response.ok || !json?.success) {
    throw new ApiError(json?.message || `Máy chủ gặp lỗi (HTTP ${response.status})`, {
      status: response.status,
      errors: json?.errors ?? null,
    });
  }

  return json;
}

/** Cú pháp ngắn gọn: api.get('/api/listings', { params }) */
export const api = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  put: (path, body, options) => request(path, { ...options, method: 'PUT', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
};
