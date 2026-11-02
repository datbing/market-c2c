/**
 * Parse a multipart/form-data body (FormData from the browser) WITHOUT a library (multer...).
 *
 * Node 18+ ships the Web `Request` API: wrap the Express request stream in
 * a standard Request and call `.formData()` -> get a FormData of strings and Files.
 *
 * Enforces a total size limit: bytes are counted while reading and it stops as soon as the limit is exceeded
 * (instead of reading everything first -> a huge upload cannot fill up the RAM).
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

  // Browsers usually send Content-Length -> reject early when it is already known to be too large
  if (Number(req.headers['content-length']) > maxBytes) throw tooLarge();

  // Count the actual bytes (in case Content-Length is missing or wrong)
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
    duplex: 'half', // required when the body is a stream
  });

  try {
    return await webRequest.formData();
  } catch {
    if (exceeded) throw tooLarge();
    throw HttpError.badRequest('Không đọc được dữ liệu gửi lên, vui lòng thử lại');
  }
}

/** Get a field's string value (skipped if it is a file), trimmed */
export function getText(formData, name) {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : undefined;
}

/** Get a field's files (empty files skipped) */
export function getFiles(formData, name) {
  return formData.getAll(name).filter((value) => typeof value !== 'string' && value.size > 0);
}
