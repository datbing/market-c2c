/**
 * Làm việc với thẻ <template> của HTML5.
 * Cấu trúc HTML của component nằm sẵn trong file .html, JS chỉ:
 *   1. Nhân bản template (cloneNode)
 *   2. Điền dữ liệu bằng textContent / thuộc tính (an toàn XSS, không cần escape)
 */

/**
 * Nhân bản phần tử gốc đầu tiên bên trong <template id="...">.
 * @param {string} id
 * @returns {HTMLElement}
 */
export function cloneTemplate(id) {
  const template = document.getElementById(id);
  if (!(template instanceof HTMLTemplateElement)) {
    throw new Error(`Không tìm thấy <template id="${id}"> trong trang`);
  }
  return template.content.firstElementChild.cloneNode(true);
}

/**
 * Điền chữ vào các phần tử có data-field="tên" trong root.
 *   fillFields(card, { title: 'iPhone', price: '9.500.000 ₫' })
 */
export function fillFields(root, data) {
  Object.entries(data).forEach(([name, value]) => {
    root.querySelectorAll(`[data-field="${name}"]`).forEach((el) => {
      el.textContent = value ?? '';
    });
  });
}
