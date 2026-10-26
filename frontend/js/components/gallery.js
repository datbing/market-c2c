/**
 * Bộ ảnh của trang chi tiết tin.
 * HTML viết sẵn trong product.html (khung ảnh lớn, nút trước/sau, dải ảnh nhỏ,
 * hộp xem phóng to <dialog>), ảnh nhỏ nhân bản từ <template id="tpl-gallery-thumb">.
 *
 * Điều khiển: bấm ảnh nhỏ, nút trước/sau, phím ← →, vuốt trên điện thoại,
 * bấm ảnh lớn để mở <dialog> xem phóng to (Esc để đóng - hành vi có sẵn của <dialog>).
 */
import { cloneTemplate } from '../utils/template.js';

const SWIPE_MIN_DISTANCE = 40; // px

export class Gallery {
  index = 0;

  /**
   * @param {HTMLElement} root   phần tử .gallery
   * @param {object} options
   * @param {{ url: string }[]} options.images
   * @param {string} options.title          tên tin, dùng làm alt ảnh
   * @param {string} [options.placeholderIcon] class icon khi tin không có ảnh
   */
  constructor(root, { images, title, placeholderIcon = 'bi-box-seam' }) {
    this.root = root;
    this.images = images;
    this.title = title;

    this.el = {
      image: root.querySelector('[data-gallery-image]'),
      open: root.querySelector('[data-gallery-open]'),
      placeholder: root.querySelector('[data-gallery-placeholder]'),
      counter: root.querySelector('[data-gallery-counter]'),
      thumbs: root.querySelector('[data-gallery-thumbs]'),
      navButtons: root.querySelectorAll('[data-gallery-nav]'),
      dialog: document.getElementById('lightbox'),
    };

    if (images.length === 0) {
      this.#renderEmpty(placeholderIcon);
      return;
    }

    this.#renderThumbs();
    this.#bindEvents();
    this.show(0);
  }

  /** Tin không có ảnh: hiện icon danh mục, ẩn mọi nút điều khiển */
  #renderEmpty(icon) {
    this.el.placeholder.querySelector('.bi').className = `bi ${icon}`;
    this.el.placeholder.hidden = false;
    this.el.open.hidden = true;
    this.el.counter.hidden = true;
    this.el.thumbs.hidden = true;
    this.el.navButtons.forEach((btn) => {
      btn.hidden = true;
    });
  }

  #renderThumbs() {
    const many = this.images.length > 1;
    this.el.thumbs.hidden = !many;
    this.el.counter.hidden = !many;
    this.el.navButtons.forEach((btn) => {
      btn.hidden = !many;
    });

    this.el.thumbs.replaceChildren(
      ...this.images.map(({ url }, i) => {
        const li = cloneTemplate('tpl-gallery-thumb');
        const button = li.querySelector('button');
        button.dataset.index = i;
        button.setAttribute('aria-label', `Xem ảnh ${i + 1}`);
        li.querySelector('img').src = url;
        return li;
      }),
    );
  }

  /** Hiện ảnh thứ i (tự quay vòng khi vượt đầu/cuối) */
  show(i) {
    const total = this.images.length;
    this.index = (i + total) % total;
    const { url } = this.images[this.index];

    this.el.image.src = url;
    this.el.image.alt = `${this.title} - ảnh ${this.index + 1}`;
    this.el.counter.textContent = `${this.index + 1} / ${total}`;

    this.el.thumbs.querySelectorAll('button').forEach((btn, n) => {
      const active = n === this.index;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-current', String(active));
    });
    // Cuộn dải ảnh nhỏ để ảnh đang chọn luôn nhìn thấy
    this.el.thumbs.querySelector('.is-active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });

    // Đang mở hộp phóng to thì cập nhật luôn
    if (this.el.dialog?.open) this.#renderLightbox();
  }

  next() {
    this.show(this.index + 1);
  }

  prev() {
    this.show(this.index - 1);
  }

  // ---------------------------------------------------------
  //  Hộp xem phóng to (<dialog>)
  // ---------------------------------------------------------
  #renderLightbox() {
    const { dialog } = this.el;
    const { url } = this.images[this.index];
    const img = dialog.querySelector('[data-lightbox-image]');
    img.src = url;
    img.alt = this.el.image.alt;
    dialog.querySelector('[data-lightbox-counter]').textContent = `${this.index + 1} / ${this.images.length}`;
    dialog.querySelectorAll('[data-lightbox-nav]').forEach((btn) => {
      btn.hidden = this.images.length < 2;
    });
  }

  openLightbox() {
    if (!this.el.dialog) return;
    this.#renderLightbox();
    this.el.dialog.showModal();
  }

  // ---------------------------------------------------------
  //  Sự kiện
  // ---------------------------------------------------------
  #bindEvents() {
    const { thumbs, open, dialog } = this.el;

    thumbs.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-index]');
      if (btn) this.show(Number(btn.dataset.index));
    });

    this.root.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-gallery-nav]');
      if (nav) nav.dataset.galleryNav === 'next' ? this.next() : this.prev();
    });


    // Phím mũi tên khi focus đang ở trong bộ ảnh
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') this.next();
      if (e.key === 'ArrowLeft') this.prev();
    });

    // Vuốt trái/phải trên màn hình cảm ứng.
    // Sau khi vuốt trình duyệt vẫn bắn thêm "click" -> dùng cờ để không mở hộp phóng to nhầm
    let startX = null;
    let swiped = false;
    open.addEventListener('pointerdown', (e) => {
      startX = e.clientX;
    });
    open.addEventListener('pointerup', (e) => {
      if (startX === null) return;
      const distance = e.clientX - startX;
      startX = null;
      if (Math.abs(distance) < SWIPE_MIN_DISTANCE) return;
      swiped = true;
      distance < 0 ? this.next() : this.prev();
    });
    open.addEventListener('click', () => {
      if (swiped) {
        swiped = false;
        return;
      }
      this.openLightbox();
    });

    if (!dialog) return;
    dialog.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-lightbox-nav]');
      if (nav) nav.dataset.lightboxNav === 'next' ? this.next() : this.prev();
      // Bấm ra vùng tối bên ngoài ảnh -> đóng
      else if (e.target === dialog) dialog.close();
    });
    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') this.next();
      if (e.key === 'ArrowLeft') this.prev();
    });
  }
}
