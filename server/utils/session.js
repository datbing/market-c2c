/**
 * express-session dùng callback -> bọc lại thành Promise để dùng được với async/await.
 */

/** Tạo session ID mới (chống tấn công session fixation khi đăng nhập) */
export const regenerateSession = (req) =>
  new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });

/** Lưu session ngay lập tức */
export const saveSession = (req) =>
  new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });

/** Hủy session (đăng xuất) */
export const destroySession = (req) =>
  new Promise((resolve, reject) => {
    if (!req.session) return resolve();
    req.session.destroy((err) => (err ? reject(err) : resolve()));
  });
