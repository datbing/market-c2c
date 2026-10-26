/**
 * Fetch API wrapper: every request to the backend goes through here.
 *  - Builds the query string (skipping empty values)
 *  - Sends JSON or FormData (image uploads)
 *  - Parses JSON; on error throws an ApiError with `message`, `status`, `errors` (per-field errors)
 *  - Supports AbortController (`signal`) to cancel stale requests while the user keeps filtering
 *  - The backend runs on a separate server (API_BASE), the session cookie is sent through CORS
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

/** Whether the error comes from a deliberately aborted request (no need to tell the user) */
export const isAbortError = (err) => err?.name === 'AbortError';

/** Build a URL with a query string, skipping undefined/null/'' params */
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
 * Send a request and return the whole JSON body: { success, data, message?, meta? }
 * @param {string} path  vd: '/api/listings'
 * @param {object} [options]
 */
export async function request(path, { method = 'GET', params, body, signal } = {}) {
  const options = {
    method,
    headers: { Accept: 'application/json' },
    credentials: 'include', // different origin -> must be 'include' to send/receive the session cookie
    signal,
  };

  if (body instanceof FormData) {
    options.body = body; // the browser sets the multipart Content-Type with its boundary
  } else if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(buildUrl(path, params), options);
  } catch (err) {
    if (isAbortError(err)) throw err;
    // fetch only rejects on network errors / API server down / blocked by CORS
    throw new ApiError('Không kết nối được máy chủ API. Vui lòng kiểm tra mạng và thử lại.');
  }

  // The server may return HTML (e.g. a proxy error) -> not parseable as JSON
  const json = await response.json().catch(() => null);

  if (!response.ok || !json?.success) {
    throw new ApiError(json?.message || `Máy chủ gặp lỗi (HTTP ${response.status})`, {
      status: response.status,
      errors: json?.errors ?? null,
    });
  }

  return json;
}

/** Short syntax: api.get('/api/listings', { params }) */
export const api = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  put: (path, body, options) => request(path, { ...options, method: 'PUT', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
};
