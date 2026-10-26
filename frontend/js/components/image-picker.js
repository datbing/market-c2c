/**
 * Chọn ảnh cho tin đăng. Ảnh CHỈ nằm trong bộ nhớ trình duyệt cho tới khi bấm Đăng.
 *
 * HTML viết sẵn trong sell.html:
 *   <div class="image-picker" id="...">
 *     <label class="image-picker__drop"> <input type="file" multiple accept="image/*"> ...</label>
 *     <ul class="image-picker__list"></ul>     (ảnh xem trước, từ <template id="tpl-image-item">)
 *     <p data-picker-status></p>
 *   </div>
 *
 * Tính năng: chọn nhiều ảnh, kéo thả file vào khung, nén bằng Canvas,
 * xem trước (URL.createObjectURL), xóa, đặt ảnh bìa, kéo thả để sắp xếp.
 * Khi sửa tin: nạp sẵn ảnh đã đăng (addExisting), trộn chung với ảnh mới.
 * Mỗi lần danh sách đổi -> phát CustomEvent 'images:change' trên phần tử gốc.
 */
import { assetUrl } from '../config.js';
import { cloneTemplate } from '../utils/template.js';
import { compressImage, formatBytes } from '../utils/image.js';
import { showToast } from './toast.js';

const MAX_INPUT_BYTES = 25 * 1024 * 1024; // ảnh gốc tối đa 25MB (trước khi nén)

let nextId = 1;

export class ImagePicker {
  /**
   * Ảnh mới: có `blob`. Ảnh đã đăng (khi sửa tin): `blob` = null, có `existingId`.
   * @type {{ id: number, blob: Blob|null, existingId: number|null, url: string, name: string }[]}
   */
  items = [];
  /** Số ảnh đang nén */
  #processing = 0;
  /** id ảnh đang được kéo (sắp xếp) */
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

  /** Các ảnh mới theo thứ tự hiển thị (dùng khi đăng tin) */
  get blobs() {
    return this.items.filter((item) => item.blob).map((item) => item.blob);
  }

  /** Tất cả ảnh theo thứ tự: { existingId } = ảnh cũ giữ lại, { blob } = ảnh mới (dùng khi sửa tin) */
  get images() {
    return this.items.map((item) => (item.existingId ? { existingId: item.existingId } : { blob: item.blob }));
  }

  /** Có ảnh mới chưa gửi lên không (để hỏi lại khi rời trang) */
  get hasNewImages() {
    return this.items.some((item) => item.blob);
  }

  /** URL xem trước của ảnh bìa (null nếu chưa có ảnh) */
  get coverUrl() {
    return this.items[0]?.url ?? null;
  }

  // ---------------------------------------------------------
  //  Thêm / xóa / sắp xếp
  // ---------------------------------------------------------
  /** Nạp ảnh đã đăng của tin (chế độ sửa tin) */
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

  /** Nén và thêm các file người dùng chọn (vượt số lượng thì bỏ bớt, có báo) */
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

    // Nén song song; ảnh nào lỗi thì báo riêng, không ảnh hưởng ảnh khác
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
    if (item.blob) URL.revokeObjectURL(item.url); // giải phóng bộ nhớ của ảnh xem trước
    this.items = this.items.filter((x) => x.id !== id);
    this.#changed();
  }

  /** Đưa ảnh lên đầu danh sách -> thành ảnh bìa */
  makeCover(id) {
    const item = this.items.find((x) => x.id === id);
    if (!item) return;
    this.items = [item, ...this.items.filter((x) => x.id !== id)];
    this.#changed();
  }

  /** Chuyển ảnh `id` tới vị trí của ảnh `targetId` (kéo thả sắp xếp) */
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
  //  Hiển thị
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
  //  Sự kiện
  // ---------------------------------------------------------
  #bindEvents() {
    // Chọn file bằng hộp thoại của hệ điều hành
    this.input.addEventListener('change', () => {
      this.addFiles(this.input.files);
      this.input.value = ''; // reset để chọn lại đúng file vừa xóa vẫn được
    });

    // Kéo file từ máy tính thả vào khung
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

    // Nút trên từng ảnh (event delegation)
    this.list.addEventListener('click', (e) => {
      const button = e.target.closest('[data-image-action]');
      if (!button) return;
      const id = Number(button.closest('[data-image-id]').dataset.imageId);
      if (button.dataset.imageAction === 'remove') this.remove(id);
      else this.makeCover(id);
    });

    // Kéo thả để sắp xếp ảnh (HTML5 Drag and Drop API)
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
