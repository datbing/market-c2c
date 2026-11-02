/**
 * Image picker for listings. Images stay ONLY in browser memory until Post is clicked.
 *
 * HTML written in sell.html:
 *   <div class="image-picker" id="...">
 *     <label class="image-picker__drop"> <input type="file" multiple accept="image/*"> ...</label>
 *     <ul class="image-picker__list"></ul>     (previews, from <template id="tpl-image-item">)
 *     <p data-picker-status></p>
 *   </div>
 *
 * Features: pick multiple images, drop files onto the box, compress with Canvas,
 * preview (URL.createObjectURL), remove, set as cover, drag and drop to reorder.
 * When editing: preloads the existing images (addExisting), mixed with new ones.
 * Every change to the list -> dispatches the 'images:change' CustomEvent on the root element.
 */
import { assetUrl } from '../config.js';
import { cloneTemplate } from '../utils/template.js';
import { compressImage, formatBytes } from '../utils/image.js';
import { showToast } from './toast.js';

const MAX_INPUT_BYTES = 25 * 1024 * 1024; // original image up to 25MB (before compression)

let nextId = 1;

export class ImagePicker {
  /**
   * New image: has a `blob`. Existing image (when editing): `blob` = null, has an `existingId`.
   * @type {{ id: number, blob: Blob|null, existingId: number|null, url: string, name: string }[]}
   */
  items = [];
  /** Number of images being compressed */
  #processing = 0;
  /** id of the image being dragged (reordering) */
  #draggingId = null;

  /**
   * @param {HTMLElement} root
   * @param {{ max?: number }} [options]
   */
  constructor(root, { max = 6 } = {}) {
    this.root = root;
    this.max = max;
    this.input = root.querySelector('input[type="file"]');
    this.drop = root.querySelector('.image-picker__drop');
    this.list = root.querySelector('.image-picker__list');
    this.status = root.querySelector('[data-picker-status]');

    this.#bindEvents();
    this.#render();
  }

  get count() {
    return this.items.length;
  }

  get isProcessing() {
    return this.#processing > 0;
  }

  /** New images in display order (used when posting) */
  get blobs() {
    return this.items.filter((item) => item.blob).map((item) => item.blob);
  }

  /** Every image in order: { existingId } = kept old image, { blob } = new image (used when editing) */
  get images() {
    return this.items.map((item) => (item.existingId ? { existingId: item.existingId } : { blob: item.blob }));
  }

  /** Whether there are unsent new images (to warn before leaving the page) */
  get hasNewImages() {
    return this.items.some((item) => item.blob);
  }

  /** Preview URL of the cover image (null when there are no images) */
  get coverUrl() {
    return this.items[0]?.url ?? null;
  }

  // ---------------------------------------------------------
  //  Add / remove / reorder
  // ---------------------------------------------------------
  /** Load the listing's existing images (edit mode) */
  addExisting(images) {
    images.forEach((image, i) => {
      this.items.push({
        id: nextId++,
        blob: null,
        existingId: image.id,
        url: assetUrl(image.url),
        name: `ảnh đã đăng ${i + 1}`,
      });
    });
    this.#changed();
  }

  /** Compress and add the files the user picked (extra files beyond the limit are dropped, with a notice) */
  async addFiles(fileList) {
    const files = [...fileList];
    const room = this.max - this.items.length - this.#processing;

    if (room <= 0) {
      showToast(`Mỗi tin tối đa ${this.max} ảnh`, 'warning');
      return;
    }
    if (files.length > room) showToast(`Chỉ thêm được ${room} ảnh nữa (tối đa ${this.max} ảnh)`, 'warning');

    const accepted = files.slice(0, room).filter((file) => {
      if (!file.type.startsWith('image/')) {
        showToast(`"${file.name}" không phải file ảnh`, 'error');
        return false;
      }
      if (file.size > MAX_INPUT_BYTES) {
        showToast(`"${file.name}" quá lớn (tối đa 25MB)`, 'error');
        return false;
      }
      return true;
    });
    if (accepted.length === 0) return;

    this.#processing += accepted.length;
    this.#render();

    // Compress in parallel; a failing image is reported on its own without affecting the others
    const results = await Promise.allSettled(accepted.map((file) => compressImage(file)));
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        const { blob } = result.value;
        this.items.push({
          id: nextId++,
          blob,
          existingId: null,
          url: URL.createObjectURL(blob),
          name: accepted[i].name,
        });
      } else {
        showToast(`Không đọc được ảnh "${accepted[i].name}" (định dạng chưa hỗ trợ)`, 'error');
      }
    });

    this.#processing -= accepted.length;
    this.#changed();
  }

  remove(id) {
    const item = this.items.find((x) => x.id === id);
    if (!item) return;
    if (item.blob) URL.revokeObjectURL(item.url); // free the preview's memory
    this.items = this.items.filter((x) => x.id !== id);
    this.#changed();
  }

  /** Move an image to the front of the list -> it becomes the cover */
  makeCover(id) {
    const item = this.items.find((x) => x.id === id);
    if (!item) return;
    this.items = [item, ...this.items.filter((x) => x.id !== id)];
    this.#changed();
  }

  /** Move image `id` to the position of image `targetId` (drag and drop reordering) */
  move(id, targetId) {
    const from = this.items.findIndex((x) => x.id === id);
    const to = this.items.findIndex((x) => x.id === targetId);
    if (from < 0 || to < 0 || from === to) return;
    const next = [...this.items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    this.items = next;
    this.#changed();
  }

  clear() {
    this.items.forEach((item) => item.blob && URL.revokeObjectURL(item.url));
    this.items = [];
    this.#changed();
  }

  // ---------------------------------------------------------
  //  Rendering
  // ---------------------------------------------------------
  #changed() {
    this.#render();
    this.root.dispatchEvent(new CustomEvent('images:change', { detail: { count: this.count } }));
  }

  #render() {
    this.list.replaceChildren(
      ...this.items.map((item, index) => {
        const li = cloneTemplate('tpl-image-item');
        li.dataset.imageId = item.id;
        const img = li.querySelector('img');
        img.src = item.url;
        img.alt = `Ảnh ${index + 1}: ${item.name}`;
        li.querySelector('[data-field="size"]').textContent = item.blob ? formatBytes(item.blob.size) : 'Đã đăng';
        li.querySelector('.image-picker__cover').hidden = index !== 0;
        li.querySelector('[data-image-action="cover"]').hidden = index === 0;
        return li;
      }),
    );

    const full = this.items.length + this.#processing >= this.max;
    this.input.disabled = full;
    this.drop.classList.toggle('is-disabled', full);
    this.drop.classList.toggle('is-busy', this.isProcessing);

    this.status.textContent = this.isProcessing
      ? `Đang xử lý ${this.#processing} ảnh...`
      : `${this.items.length}/${this.max} ảnh${this.items.length ? ' · Kéo thả để sắp xếp, ảnh đầu tiên là ảnh bìa' : ''}`;
  }

  // ---------------------------------------------------------
  //  Events
  // ---------------------------------------------------------
  #bindEvents() {
    // Pick files with the OS file dialog
    this.input.addEventListener('change', () => {
      this.addFiles(this.input.files);
      this.input.value = ''; // reset so the same file can be picked again after removing it
    });

    // Drag files from the computer and drop them onto the box
    ['dragenter', 'dragover'].forEach((type) =>
      this.drop.addEventListener(type, (e) => {
        if (!e.dataTransfer?.types.includes('Files')) return;
        e.preventDefault();
        this.drop.classList.add('is-dragover');
      }),
    );
    ['dragleave', 'drop'].forEach((type) =>
      this.drop.addEventListener(type, () => this.drop.classList.remove('is-dragover')),
    );
    this.drop.addEventListener('drop', (e) => {
      if (!e.dataTransfer?.files.length) return;
      e.preventDefault();
      if (!this.input.disabled) this.addFiles(e.dataTransfer.files);
    });

    // Buttons on each image (event delegation)
    this.list.addEventListener('click', (e) => {
      const button = e.target.closest('[data-image-action]');
      if (!button) return;
      const id = Number(button.closest('[data-image-id]').dataset.imageId);
      if (button.dataset.imageAction === 'remove') this.remove(id);
      else this.makeCover(id);
    });

    // Drag and drop to reorder images (HTML5 Drag and Drop API)
    this.list.addEventListener('dragstart', (e) => {
      const li = e.target.closest('[data-image-id]');
      if (!li) return;
      this.#draggingId = Number(li.dataset.imageId);
      e.dataTransfer.effectAllowed = 'move';
      li.classList.add('is-dragging');
    });
    this.list.addEventListener('dragover', (e) => {
      if (this.#draggingId !== null) e.preventDefault();
    });
    this.list.addEventListener('drop', (e) => {
      const target = e.target.closest('[data-image-id]');
      if (this.#draggingId === null || !target) return;
      e.preventDefault();
      this.move(this.#draggingId, Number(target.dataset.imageId));
    });
    this.list.addEventListener('dragend', () => {
      this.#draggingId = null;
      this.list.querySelector('.is-dragging')?.classList.remove('is-dragging');
    });
  }
}
