/**
 * Image gallery of the listing detail page.
 * The HTML is written in product.html (main image, prev/next buttons, thumbnail strip,
 * zoom <dialog>), thumbnails are cloned from <template id="tpl-gallery-thumb">.
 *
 * Controls: click a thumbnail, prev/next buttons, Left/Right arrow keys, swipe on phones,
 * click the main image to open the zoom <dialog> (Esc closes it - built-in <dialog> behavior).
 */
import { assetUrl } from '../config.js';
import { cloneTemplate } from '../utils/template.js';

const SWIPE_MIN_DISTANCE = 40; // px

export class Gallery {
  index = 0;

  /**
   * @param {HTMLElement} root   the .gallery element
   * @param {object} options
   * @param {{ url: string }[]} options.images
   * @param {string} options.title          listing title, used as the image alt text
   * @param {string} [options.placeholderIcon] icon class when the listing has no images
   */
  constructor(root, { images, title, placeholderIcon = 'bi-box-seam' }) {
    this.root = root;
    // Images live on the API server (different origin) -> turn "/uploads/..." into a full URL
    this.images = images.map((image) => ({ ...image, url: assetUrl(image.url) }));
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

    if (this.images.length === 0) {
      this.#renderEmpty(placeholderIcon);
      return;
    }

    this.#renderThumbs();
    this.#bindEvents();
    this.show(0);
  }

  /** Listing without images: show the category icon, hide every control */
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

  /** Show image i (wraps around past the first/last image) */
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
    // Scroll the thumbnail strip so the selected image stays visible
    this.el.thumbs.querySelector('.is-active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });

    // Also update the zoom dialog if it is open
    if (this.el.dialog?.open) this.#renderLightbox();
  }

  next() {
    this.show(this.index + 1);
  }

  prev() {
    this.show(this.index - 1);
  }

  // ---------------------------------------------------------
  //  Zoom dialog (<dialog>)
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
  //  Events
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


    // Arrow keys while focus is inside the gallery
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') this.next();
      if (e.key === 'ArrowLeft') this.prev();
    });

    // Swipe left/right on touch screens.
    // The browser still fires a "click" after a swipe -> use a flag so the zoom dialog does not open by mistake
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
      // Click on the dark area outside the image -> close
      else if (e.target === dialog) dialog.close();
    });
    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') this.next();
      if (e.key === 'ArrowLeft') this.prev();
    });
  }
}
