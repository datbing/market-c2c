/**
 * Admin page shell (shared by every page in /admin/):
 *  - Admins only: not logged in -> login page; not an admin -> home page
 *  - Sidebar: highlights the current page, pending listings / open reports counters,
 *    becomes a slide-in drawer on mobile (menu button in the topbar)
 *  - Topbar: admin name, theme toggle, logout
 *
 * The shell HTML is written in every admin page (copied from admin/index.html).
 */
import { $, $$ } from '../utils/dom.js';
import { getCurrentUser, logout, loginUrl } from '../services/auth.js';
import { getAdminStats } from '../services/admin.js';
import { setFlash, consumeFlash } from '../services/flash.js';
import { initThemeToggle } from './theme.js';
import { showToast } from './toast.js';

/** Update the sidebar counters (call again after reviewing a listing / handling a report) */
export async function refreshAdminBadges(stats) {
  try {
    const data = stats ?? (await getAdminStats(7));
    const set = (name, n) => {
      const badge = $(`[data-admin-badge="${name}"]`);
      if (!badge) return;
      badge.textContent = n > 99 ? '99+' : n;
      badge.hidden = n === 0;
    };
    set('pending', data.listings.pending);
    set('reports', data.openReports);
  } catch {
    /* counters are optional, ignore failures */
  }
}

function initSidebar() {
  const sidebar = $('#admin-sidebar');
  const backdrop = $('#admin-backdrop');
  const toggle = $('#admin-menu-toggle');

  const open = (value) => {
    sidebar.classList.toggle('is-open', value);
    backdrop.hidden = !value;
    toggle.setAttribute('aria-expanded', String(value));
    document.body.classList.toggle('no-scroll', value);
  };
  toggle.addEventListener('click', () => open(!sidebar.classList.contains('is-open')));
  backdrop.addEventListener('click', () => open(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') open(false);
  });

  // Highlight the current item based on the current path
  const path = window.location.pathname.replace(/\.html$/, '').replace(/\/$/, '/index');
  $$('[data-admin-nav]', sidebar).forEach((link) => {
    const target = link.getAttribute('href').replace(/\/$/, '/index');
    if (target === path) link.setAttribute('aria-current', 'page');
  });
}

/**
 * Initialize the admin shell. Returns the admin user (or null while redirecting).
 * @param {{ badges?: boolean }} [options] badges=false: the page updates the sidebar counters itself
 *        (the dashboard already loaded the stats, no need to call the API twice)
 * @returns {Promise<object|null>}
 */
export async function initAdminShell({ badges = true } = {}) {
  let user = null;
  try {
    user = await getCurrentUser();
  } catch {
    /* network error -> treat as logged out */
  }
  if (!user) {
    window.location.replace(loginUrl());
    return null;
  }
  if (user.role !== 'admin') {
    setFlash('Bạn không có quyền vào trang quản trị', 'error');
    window.location.replace('/');
    return null;
  }

  $('[data-admin-name]').textContent = user.name;
  $('[data-admin-initial]').textContent = user.name.trim().charAt(0) || 'A';
  initThemeToggle($('#theme-toggle'));
  initSidebar();

  $('#admin-logout').addEventListener('click', async () => {
    try {
      await logout();
      window.location.replace('/login');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  if (badges) refreshAdminBadges();

  const flash = consumeFlash();
  if (flash) showToast(flash.message, flash.type, 4500);
  return user;
}
