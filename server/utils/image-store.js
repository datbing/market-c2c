/**
 * Lưu / xóa ảnh tin đăng trong thư mục uploads/.
 *  - Nhận diện loại ảnh bằng "magic bytes" (vài byte đầu file), KHÔNG tin đuôi file
 *    hay Content-Type do trình duyệt gửi -> không ai đổi tên file .php thành .jpg để lọt qua được.
 *  - Tên file do server sinh ngẫu nhiên (UUID) -> không trùng, không ghi đè, không đoán được.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const UPLOAD_DIR = path.join(ROOT_DIR, 'uploads');
const LISTING_SUBDIR = 'listings';

/**
 * Đọc chữ ký đầu file để biết loại ảnh.
 * @param {Buffer} buf
 * @returns {'jpg'|'png'|'webp'|null}
 */
export function detectImageType(buf) {
  if (buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  // WebP: "RIFF" .... "WEBP"
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/**
 * Ghi các ảnh ra đĩa.
 * @param {{ buffer: Buffer, ext: string }[]} images
 * @returns {Promise<string[]>} đường dẫn tương đối lưu vào DB, vd "listings/3f2a....webp"
 */
export async function saveListingImages(images) {
  const dir = path.join(UPLOAD_DIR, LISTING_SUBDIR);
  await fs.mkdir(dir, { recursive: true });

  const saved = [];
  try {
    for (const { buffer, ext } of images) {
      const relative = `${LISTING_SUBDIR}/${randomUUID()}.${ext}`;
      // flag 'wx': báo lỗi nếu file đã tồn tại thay vì ghi đè
      await fs.writeFile(path.join(UPLOAD_DIR, relative), buffer, { flag: 'wx' });
      saved.push(relative);
    }
    return saved;
  } catch (err) {
    await removeImages(saved); // ghi được nửa chừng thì dọn phần đã ghi
    throw err;
  }
}

/**
 * Xóa ảnh (bỏ qua file không tồn tại). Chỉ xóa được file nằm trong uploads/.
 * @param {string[]} relativePaths
 */
export async function removeImages(relativePaths) {
  await Promise.allSettled(
    relativePaths.map(async (relative) => {
      const full = path.resolve(UPLOAD_DIR, relative);
      // Chặn đường dẫn kiểu "../../.env" thoát ra ngoài thư mục uploads
      if (!full.startsWith(UPLOAD_DIR + path.sep)) return;
      await fs.rm(full, { force: true });
    }),
  );
}
