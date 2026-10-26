/**
 * Helpers for the HTML5 <template> element.
 * The component HTML is written in the .html file, JS only:
 *   1. Clones the template (cloneNode)
 *   2. Fills in data with textContent / attributes (XSS safe, no escaping needed)
 */

/**
 * Clone the first root element inside <template id="...">.
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
 * Fill text into the elements with data-field="name" inside root.
 *   fillFields(card, { title: 'iPhone', price: '9.500.000 ₫' })
 */
export function fillFields(root, data) {
  Object.entries(data).forEach(([name, value]) => {
    root.querySelectorAll(`[data-field="${name}"]`).forEach((el) => {
      el.textContent = value ?? '';
    });
  });
}
