/**
 * express-session uses callbacks -> wrapped in Promises to use with async/await.
 */

/** Create a new session ID (prevents session fixation attacks on login) */
export const regenerateSession = (req) =>
  new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });

/** Save the session immediately */
export const saveSession = (req) =>
  new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });

/** Destroy the session (logout) */
export const destroySession = (req) =>
  new Promise((resolve, reject) => {
    if (!req.session) return resolve();
    req.session.destroy((err) => (err ? reject(err) : resolve()));
  });
