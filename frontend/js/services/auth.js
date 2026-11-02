/**
 * Client-side login state.
 * The server keeps the session in an httpOnly cookie, the client only asks "who am I?" via /api/auth/me.
 */
import { api } from './api.js';

let currentUserPromise = null;

/**
 * Get the logged in user (null for guests).
 * The result is cached for the page so several modules calling it cost only one request.
 */
export function getCurrentUser({ refresh = false } = {}) {
  if (!currentUserPromise || refresh) {
    currentUserPromise = api
      .get('/api/auth/me')
      .then(({ data }) => data)
      .catch((err) => {
        if (err.status === 401 || err.status === 403) return null; // not logged in / locked
        currentUserPromise = null; // network error -> retry next time
        throw err;
      });
  }
  return currentUserPromise;
}

/** Log in, returns the user. Errors (wrong password, locked...) throw an ApiError */
export async function login({ email, password }) {
  const { data } = await api.post('/api/auth/login', { email, password });
  currentUserPromise = Promise.resolve(data);
  return data;
}

/** Register (the server logs in right after creating the account), returns the user */
export async function register({ name, email, phone, password }) {
  const { data } = await api.post('/api/auth/register', { name, email, phone, password });
  currentUserPromise = Promise.resolve(data);
  return data;
}

export async function logout() {
  await api.post('/api/auth/logout');
  currentUserPromise = Promise.resolve(null);
}

/**
 * Page to return to after logging in, taken from ?redirect=...
 * Only internal paths ("/sell") are accepted, to prevent abuse as a redirect
 * to phishing pages ("https://...", "//evil.com").
 */
export function getRedirectTarget(fallback = '/') {
  const target = new URLSearchParams(window.location.search).get('redirect') ?? '';
  const isInternal = target.startsWith('/') && !target.startsWith('//') && !target.startsWith('/\\');
  return isInternal ? target : fallback;
}

/** Login page URL with ?redirect= back to the current page */
export function loginUrl(redirect = window.location.pathname + window.location.search) {
  return `/login?redirect=${encodeURIComponent(redirect)}`;
}
