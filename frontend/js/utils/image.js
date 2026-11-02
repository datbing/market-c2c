/**
 * Compress images in the browser with the Canvas API before sending them to the server.
 * A 4-8MB phone photo -> about 150-400KB, faster uploads and a lighter server.
 */

const OUTPUT_TYPES = ['image/webp', 'image/jpeg']; // prefer WebP, fall back to JPEG if unsupported

/** canvas.toBlob uses a callback -> wrap it in a Promise to use with await */
const canvasToBlob = (canvas, type, quality) =>
  new Promise((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * @param {File} file  image picked by the user
 * @param {object} [options]
 * @param {number} [options.maxSize]  longest side after compression (px)
 * @param {number} [options.quality]  quality 0-1
 * @returns {Promise<{ blob: Blob, width: number, height: number }>}
 * @throws if the browser cannot decode the image (e.g. HEIC in Chrome)
 */
export async function compressImage(file, { maxSize = 1280, quality = 0.82 } = {}) {
  // createImageBitmap decodes the image and applies the EXIF orientation of phone photos
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });

  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // transparent PNG -> white background when converting to JPEG
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  for (const type of OUTPUT_TYPES) {
    const blob = await canvasToBlob(canvas, type, quality);
    // Unsupported format makes the browser return PNG -> try the next format
    if (blob && blob.type === type) return { blob, width, height };
  }
  throw new Error('Trình duyệt không nén được ảnh');
}

/** 245760 -> "240 KB", 3145728 -> "3,0 MB" */
export function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} MB`;
}
