/**
 * Shared parts of the login and register pages.
 */
import { $$ } from '../utils/dom.js';
import { getCurrentUser, getRedirectTarget } from '../services/auth.js';

/**
 * Already logged in -> no reason to stay on this page, redirect right away.
 * Call BEFORE initHeader() so the header does not show (and consume) the flash message
 * of a page that is about to be left.
 * @returns {Promise<boolean>} true while redirecting
 */
export async function redirectIfLoggedIn() {
  try {
    const user = await getCurrentUser();
    if (user) {
      window.location.replace(getRedirectTarget());
      return true;
    }
  } catch {
    /* network error: just let the user see the form */
  }
  return false;
}

/**
 * Keep ?redirect= when switching between the login and register pages.
 * Applies to links with the data-keep-redirect attribute.
 */
export function keepRedirectOnLinks() {
  const redirect = new URLSearchParams(window.location.search).get('redirect');
  if (!redirect) return;
  $$('a[data-keep-redirect]').forEach((link) => {
    const url = new URL(link.href);
    url.searchParams.set('redirect', redirect);
    link.href = url.pathname + url.search;
  });
}
