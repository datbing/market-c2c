/**
 * Client-side cookie read/write (only for non-sensitive data such as the theme).
 * The login session is an httpOnly cookie managed by the server, JS cannot read it.
 */

export function getCookie(name) {
  const pair = document.cookie
    .split('; ')
    .map((item) => item.split('='))
    .find(([key]) => key === name);
  return pair ? decodeURIComponent(pair[1] ?? '') : null;
}

/** Write a cookie, lives 1 year by default, valid for the whole site */
export function setCookie(name, value, { days = 365 } = {}) {
  const maxAge = days * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/; SameSite=Lax`;
}
