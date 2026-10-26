/**
 * Tiện ích xử lý chuỗi tiếng Việt.
 */

/** Bỏ dấu tiếng Việt: "Điện thoại" -> "Dien thoai" */
export function removeVietnameseTones(str = '') {
  return String(str)
    .normalize('NFD') // tách chữ và dấu thành ký tự riêng
    .replace(/[\u0300-\u036f]/g, '') // xóa các ký tự dấu
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/**
 * Tạo chuỗi tìm kiếm: bỏ dấu + chữ thường + gộp khoảng trắng.
 * Lưu vào cột `search_text` để người dùng gõ không dấu vẫn tìm ra.
 */
export function toSearchText(...parts) {
  return removeVietnameseTones(parts.filter(Boolean).join(' '))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tạo slug cho URL: "Điện thoại & Máy tính bảng" -> "dien-thoai-may-tinh-bang" */
export function slugify(str = '') {
  return removeVietnameseTones(str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
