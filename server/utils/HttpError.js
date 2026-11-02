/**
 * HTTP error with a status code.
 * Controllers only need `throw HttpError.notFound(...)`, errorHandler returns the right JSON.
 */
export class HttpError extends Error {
  /**
   * @param {number} status   HTTP status (400, 401, 404...)
   * @param {string} message  Message shown to the user
   * @param {object|null} errors Detailed per-field errors (for forms)
   */
  constructor(status, message, errors = null) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.errors = errors;
  }

  static badRequest(message = 'Yêu cầu không hợp lệ', errors = null) {
    return new HttpError(400, message, errors);
  }

  static unauthorized(message = 'Bạn cần đăng nhập để tiếp tục') {
    return new HttpError(401, message);
  }

  static forbidden(message = 'Bạn không có quyền thực hiện thao tác này') {
    return new HttpError(403, message);
  }

  static notFound(message = 'Không tìm thấy dữ liệu') {
    return new HttpError(404, message);
  }

  static conflict(message = 'Dữ liệu bị trùng', errors = null) {
    return new HttpError(409, message, errors);
  }

  static unprocessable(errors, message = 'Dữ liệu không hợp lệ') {
    return new HttpError(422, message, errors);
  }
}
