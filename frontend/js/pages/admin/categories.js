/**
 * ADMIN - CATEGORIES: /admin/categories
 *  - Category table: icon, name, slug, order, active listings / total listings
 *  - Add / edit inside a <dialog> (form uses FormHandler, same rules as the server),
 *    live icon preview + a grid of suggested icons to pick from
 *  - Delete: only when the category has no listings (the server enforces it too)
 *  - After saving, clear the category cache in LocalStorage so the home page sees it right away
 */
import { $ } from '../../utils/dom.js';
import { cloneTemplate, fillFields } from '../../utils/template.js';
import { rules } from '../../utils/validators.js';
import { local } from '../../services/storage.js';
import { getAdminCategories, saveCategory, deleteCategory } from '../../services/admin.js';
import { initAdminShell } from '../../components/admin-shell.js';
import { FormHandler } from '../../components/form.js';
import { confirmDialog } from '../../components/confirm-dialog.js';
import { showToast } from '../../components/toast.js';

/** Bootstrap Icons commonly used for marketplace categories */
const ICON_CHOICES = [
  'bi-phone', 'bi-laptop', 'bi-tv', 'bi-camera', 'bi-headphones', 'bi-controller',
  'bi-bag', 'bi-handbag', 'bi-watch', 'bi-gem', 'bi-house-door', 'bi-lamp',
  'bi-bicycle', 'bi-car-front', 'bi-scooter', 'bi-book', 'bi-pencil', 'bi-trophy',
  'bi-balloon-heart', 'bi-heart-pulse', 'bi-flower1', 'bi-tools', 'bi-music-note-beamed', 'bi-tag',
];

class AdminCategoriesPage {
  categories = new Map();
  editingId = null;

  async init() {
    if (!(await initAdminShell())) return;
    this.dialog = $('#category-dialog');
    this.form = $('#category-form');
    this.renderIconChoices();
    this.formHandler = new FormHandler(this.form, {
      schema: {
        name: [rules.required('Vui lòng nhập tên danh mục'), rules.minLength(2), rules.maxLength(100)],
        icon: [rules.pattern(/^bi-[a-z0-9-]+$/, 'Icon phải là class Bootstrap Icons, vd: bi-phone')],
        sortOrder: [rules.pattern(/^\d+$/, 'Thứ tự là số nguyên không âm')],
      },
      alert: $('#category-alert'),
      onSubmit: (values) => this.save(values),
    });
    this.bindEvents();
    this.load();
  }

  async load() {
    try {
      const rows = await getAdminCategories();
      this.categories = new Map(rows.map((c) => [c.id, c]));
      $('#category-rows').replaceChildren(...rows.map((c) => this.createRow(c)));
      $('#category-count').textContent = `${rows.length} danh mục`;
      $('#admin-error').hidden = true;
      $('#category-table').hidden = false;
    } catch (err) {
      $('#admin-error-message').textContent = err.message;
      $('#admin-error').hidden = false;
      $('#category-table').hidden = true;
    }
  }

  createRow(c) {
    const row = cloneTemplate('tpl-category-row');
    row.dataset.id = c.id;
    fillFields(row, {
      name: c.name,
      slug: c.slug,
      sort: c.sortOrder,
      active: c.listingCount,
      total: c.totalCount,
    });
    row.querySelector('.category-icon .bi').className = `bi ${c.icon || 'bi-tag'}`;

    // Still has listings -> cannot delete: disable the button + explain on hover
    const del = row.querySelector('[data-action="delete"]');
    if (c.totalCount > 0) {
      del.disabled = true;
      del.title = `Còn ${c.totalCount} tin thuộc danh mục này`;
    }
    return row;
  }

  // =======================================================
  //  ADD / EDIT FORM (inside a <dialog>)
  // =======================================================
  renderIconChoices() {
    $('#icon-choices').replaceChildren(
      ...ICON_CHOICES.map((icon) => {
        const btn = cloneTemplate('tpl-icon-choice');
        btn.dataset.icon = icon;
        btn.title = icon;
        btn.setAttribute('aria-label', icon);
        btn.querySelector('.bi').className = `bi ${icon}`;
        return btn;
      }),
    );
  }

  /** Update the icon preview + the selected icon button */
  previewIcon() {
    const icon = this.form.elements.icon.value.trim() || 'bi-tag';
    $('#icon-preview .bi').className = `bi ${/^bi-[a-z0-9-]+$/.test(icon) ? icon : 'bi-question-square'}`;
    $('#icon-choices').querySelectorAll('[data-icon]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.icon === icon));
    });
  }

  openForm(category = null) {
    this.editingId = category?.id ?? null;
    this.form.reset();
    this.formHandler.showErrors({});
    this.formHandler.hideAlert();
    $('#category-dialog-title').textContent = category ? `Sửa danh mục "${category.name}"` : 'Thêm danh mục';
    if (category) {
      this.form.elements.name.value = category.name;
      this.form.elements.icon.value = category.icon ?? '';
      this.form.elements.sortOrder.value = category.sortOrder;
    }
    this.previewIcon();
    this.dialog.showModal();
    this.form.elements.name.focus();
  }

  async save(values) {
    const payload = { name: values.name, icon: values.icon, sortOrder: values.sortOrder };
    const { message } = await saveCategory(this.editingId, payload);
    local.remove('cache:categories'); // home / sell pages reload the new categories
    this.dialog.close();
    showToast(message, 'success');
    this.load();
  }

  async remove(category, button) {
    const ok = await confirmDialog({
      title: `Xóa danh mục "${category.name}"?`,
      message: 'Danh mục sẽ bị xóa vĩnh viễn.',
      confirmText: 'Xóa',
      danger: true,
    });
    if (!ok) return;
    button.disabled = true;
    try {
      showToast(await deleteCategory(category.id), 'success');
      local.remove('cache:categories');
      this.load();
    } catch (err) {
      showToast(err.message, 'error');
      button.disabled = false;
    }
  }

  bindEvents() {
    $('#category-add').addEventListener('click', () => this.openForm());
    $('#category-cancel').addEventListener('click', () => this.dialog.close());
    $('#admin-retry').addEventListener('click', () => this.load());

    this.form.elements.icon.addEventListener('input', () => this.previewIcon());
    $('#icon-choices').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-icon]');
      if (!btn) return;
      this.form.elements.icon.value = btn.dataset.icon;
      this.form.elements.icon.dispatchEvent(new Event('input', { bubbles: true }));
    });

    $('#category-rows').addEventListener('click', (e) => {
      const button = e.target.closest('button[data-action]');
      if (!button) return;
      const category = this.categories.get(Number(button.closest('[data-id]').dataset.id));
      if (!category) return;
      if (button.dataset.action === 'edit') this.openForm(category);
      else this.remove(category, button);
    });
  }
}

new AdminCategoriesPage().init();
