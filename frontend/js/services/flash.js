/**
 * "Flash" messages: stored in SessionStorage before navigating,
 * the next page reads and shows it (toast) then deletes it right away -> shown exactly once.
 *   setFlash('Đăng nhập thành công', 'success'); location.href = '/';
 */
import { session } from './storage.js';

const KEY = 'flash';

export function setFlash(message, type = 'info') {
  session.set(KEY, { message, type });
}

/** Read and delete the pending message (null if none) */
export function consumeFlash() {
  const flash = session.get(KEY);
  session.remove(KEY);
  return flash?.message ? flash : null;
}
