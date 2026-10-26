/**
 * Nén ảnh ngay trên trình duyệt bằng Canvas API trước khi gửi lên server.
 * Ảnh chụp điện thoại 4–8MB -> còn khoảng 150–400KB, upload nhanh và server nhẹ.
 */

const OUTPUT_TYPES = ['image/webp', 'image/jpeg']; // ưu tiên WebP, trình duyệt không hỗ trợ thì JPEG

/** canvas.toBlob dùng callback -> bọc thành Promise để dùng với await */
const canvasToBlob = (canvas, type, quality) =>
  new Promise((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * @param {File} file  ảnh người dùng chọn
 * @param {object} [options]
 * @param {number} [options.maxSize]  cạnh dài nhất sau khi nén (px)
 * @param {number} [options.quality]  chất lượng 0–1
 * @returns {Promise<{ blob: Blob, width: number, height: number }>}
 * @throws nếu trình duyệt không đọc được ảnh (vd: HEIC trên Chrome)
 */
export async function compressImage(file, { maxSize = 1280, quality = 0.82 } = {}) {
  // createImageBitmap giải mã ảnh, tự xoay đúng chiều theo EXIF của ảnh chụp điện thoại
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });

  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // ảnh PNG nền trong suốt -> nền trắng khi đổi sang JPEG
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  for (const type of OUTPUT_TYPES) {
    const blob = await canvasToBlob(canvas, type, quality);
    // Trình duyệt không hỗ trợ định dạng thì trả về PNG -> thử định dạng tiếp theo
    if (blob && blob.type === type) return { blob, width, height };
  }
  throw new Error('Trình duyệt không nén được ảnh');
}

/** 245760 -> "240 KB", 3145728 -> "3,0 MB" */
export function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} MB`;
}
