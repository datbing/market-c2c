/**
 * Đọc body multipart/form-data (FormData từ trình duyệt) KHÔNG cần thư viện (multer...).
 *
 * Node 18+ có sẵn Web API `Request`: bọc luồng dữ liệu của request Express thành
 * một Request chuẩn rồi gọi `.formData()` -> nhận về FormData gồm chuỗi và File.
 *
 * Có giới hạn tổng dung lượng: đếm byte khi đọc, vượt quá thì dừng ngay
 * (không đợi đọc hết rồi mới báo -> tránh bị gửi file khổng lồ làm đầy RAM).
 */
import { Readable, Transform } from 'node:stream';
import { HttpError } from './HttpError.js';

/**
 * @param {import('express').Request} req
 * @param {{ maxBytes: number }} options
 * @returns {Promise<FormData>}
 */
export async function parseMultipart(req, { maxBytes }) {
  const contentType = req.headers['content-type'] ?? '';
  if (!contentType.startsWith('multipart/form-data')) {
    throw HttpError.badRequest('Dữ liệu phải được gửi dạng FormData (multipart/form-data)');
  }

  const tooLarge = () =>
    new HttpError(413, `Dữ liệu gửi lên quá lớn (tối đa ${Math.round(maxBytes / 1024 / 1024)}MB)`);

  // Trình duyệt thường gửi kèm Content-Length -> từ chối sớm nếu đã biết là quá lớn
  if (Number(req.headers['content-length']) > maxBytes) throw tooLarge();

  // Đếm byte thực tế (phòng trường hợp không có / khai sai Content-Length)
  let received = 0;
  let exceeded = false;
  const limiter = new Transform({
    transform(chunk, encoding, callback) {
      received += chunk.length;
      if (received > maxBytes) {
        exceeded = true;
        callback(new Error('LIMIT'));
        return;
      }
      callback(null, chunk);
    },
  });

  const webRequest = new Request('http://localhost/upload', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body: Readable.toWeb(req.pipe(limiter)),
    duplex: 'half', // bắt buộc khi body là stream
  });

  try {
    return await webRequest.formData();
  } catch {
    if (exceeded) throw tooLarge();
    throw HttpError.badRequest('Không đọc được dữ liệu gửi lên, vui lòng thử lại');
  }
}

/** Lấy giá trị chuỗi của 1 trường (bỏ qua nếu là file), đã trim */
export function getText(formData, name) {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : undefined;
}

/** Lấy các file của 1 trường (bỏ file rỗng) */
export function getFiles(formData, name) {
  return formData.getAll(name).filter((value) => typeof value !== 'string' && value.size > 0);
}
