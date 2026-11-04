/**
 * ListPage: base class for every "filterable, paginated list" page
 * (My listings, Orders, Admin listings / users / reports).
 *
 * It takes care of the shared parts:
 *  - Filters read from / written to the URL (?status=&q=&page=) -> F5 and shared links keep the view
 *  - Loading with AbortController (a newer request cancels the older one)
 *  - Showing exactly one block: loading | list | empty | error (all written in the HTML)
 *  - Status tabs with counts, debounced search box, pagination, retry button
 *  - Action buttons inside the list (event delegation on [data-action])
 *
 * A subclass only provides what is specific to its page:
 *    defaults                       default filter values, e.g. { status: '', q: '', page: 1 }
 *    parseFilters(params)           read + validate the filters from URLSearchParams
 *    fetchPage(params, signal)      call the API -> { data, meta }
 *    createItem(item)               build one row / card from a <template>
 *    handleAction(item, action, btn) react to a [data-action] button
 *    onData(meta), renderEmpty()    optional hooks
 */
import { $, $$, debounce } from '../utils/dom.js';
import { isAbortError } from '../services/api.js';
import { renderPagination } from './pagination.js';
import { showToast } from './toast.js';

const PAGE_SIZE = 10;

export class ListPage {
  defaults = { page: 1 };
  filters = { page: 1 };
  /** Map id -> item currently on screen */
  items = new Map();
  controller = null;

  /**
   * @param {object} selectors  CSS selectors of the page blocks:
   *   list, empty, error, errorMessage, retry, pagination (required)
   *   loading, rows, tabs, search, searchForm (optional)
   */
  constructor(selectors) {
    this.el = Object.fromEntries(Object.entries(selectors).map(([key, sel]) => [key, $(sel)]));
  }

  /** Call from the subclass once the auth check passed */
  start() {
    this.filters = this.parseFilters(new URLSearchParams(window.location.search));
    if (this.el.search) this.el.search.value = this.filters.q ?? '';
    this.bindEvents();
    this.load();
  }

  /** Shared helper for parseFilters: page number from the URL (>= 1) */
  static readPage(params) {
    return Math.max(1, Number.parseInt(params.get('page'), 10) || 1);
  }

  /** Change filters (back to page 1 unless a page is given) -> write them to the URL -> reload */
  setFilters(patch) {
    this.filters = { ...this.filters, page: 1, ...patch };
    const params = new URLSearchParams();
    Object.entries(this.filters).forEach(([key, value]) => {
      if (key === 'page') {
        if (value > 1) params.set(key, value);
      } else if (value || this.defaults[key]) {
        // A key with a non-empty default (e.g. status=pending) is always written,
        // so an explicit empty value ("All") survives a reload
        params.set(key, value);
      }
    });
    history.replaceState(null, '', `${window.location.pathname}${params.size ? `?${params}` : ''}`);
    this.load();
  }

  /** 'loading' | 'list' | 'empty' | 'error' */
  showState(state) {
    const { list, loading, empty, error, pagination } = this.el;
    if (loading) loading.hidden = state !== 'loading';
    list.hidden = state !== 'list';
    empty.hidden = state !== 'empty';
    error.hidden = state !== 'error';
    if (state !== 'list') pagination.hidden = true;
  }

  async load() {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;

    // A list is already shown -> fade it instead of showing the skeleton (less jumpy)
    if (this.el.loading && this.el.list.hidden) this.showState('loading');
    else this.el.list.classList.add('is-loading');

    try {
      const { data, meta } = await this.fetchPage({ ...this.filters, limit: PAGE_SIZE }, controller.signal);

      // The current page became empty (e.g. its last item was removed) -> go back one page
      if (data.length === 0 && this.filters.page > 1) {
        this.setFilters({ page: this.filters.page - 1 });
        return;
      }

      this.renderTabs(meta.counts);
      this.onData(meta);
      this.items = new Map(data.map((item) => [item.id, item]));

      if (data.length === 0) {
        this.renderEmpty();
        this.showState('empty');
        return;
      }
      (this.el.rows ?? this.el.list).replaceChildren(...data.map((item) => this.createItem(item)));
      this.showState('list');
      renderPagination(this.el.pagination, meta);
    } catch (err) {
      if (isAbortError(err)) return;
      this.el.errorMessage.textContent = err.message;
      this.showState('error');
    } finally {
      if (this.controller === controller) this.el.list.classList.remove('is-loading');
    }
  }

  /** Update the tab counts + the selected tab (the tabs are written in the HTML) */
  renderTabs(counts = {}) {
    if (!this.el.tabs) return;
    $$('[data-status-tab]', this.el.tabs).forEach((tab) => {
      const status = tab.dataset.statusTab;
      const active = status === this.filters.status;
      tab.querySelector('[data-tab-count]').textContent = counts[status || 'all'] ?? 0;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-pressed', String(active));
    });
  }

  /**
   * Run an action of a list button: disable the button, call the API, show the result, reload.
   * @param {HTMLButtonElement} button
   * @param {() => Promise<string>} task  resolves to the success message
   */
  async runTask(button, task) {
    button.disabled = true;
    try {
      showToast(await task(), 'success');
      this.load();
      return true;
    } catch (err) {
      showToast(err.message, 'error');
      button.disabled = false;
      return false;
    }
  }

  bindEvents() {
    this.el.tabs?.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-status-tab]');
      if (tab) this.setFilters({ status: tab.dataset.statusTab });
    });

    // Search: debounced while typing, Enter searches immediately
    if (this.el.search) {
      const search = debounce(() => this.setFilters({ q: this.el.search.value.trim() }), 400);
      this.el.search.addEventListener('input', search);
      this.el.searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        search.cancel();
        this.setFilters({ q: this.el.search.value.trim() });
      });
    }

    // Buttons on each row / card (event delegation)
    this.el.list.addEventListener('click', (e) => {
      const button = e.target.closest('button[data-action]');
      if (!button) return;
      const item = this.items.get(Number(button.closest('[data-id]').dataset.id));
      if (item) this.handleAction(item, button.dataset.action, button);
    });

    this.el.pagination.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-page]');
      if (!btn || btn.disabled) return;
      this.setFilters({ page: Number(btn.dataset.page) });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    this.el.retry.addEventListener('click', () => this.load());
  }

  // ---------- Optional hooks ----------
  onData() {}
  renderEmpty() {}
}
