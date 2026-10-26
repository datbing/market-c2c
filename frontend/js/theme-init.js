/**
 * Chạy ĐỒNG BỘ trong <head> (không phải module) để đặt theme trước khi trình duyệt vẽ trang,
 * tránh hiện tượng trang trắng chớp rồi mới chuyển tối.
 * Ưu tiên: cookie mc2c_theme -> cài đặt của hệ điều hành.
 */
(function applyInitialTheme() {
  var match = document.cookie.match(/(?:^|;\s*)mc2c_theme=(dark|light)/);
  var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = match ? match[1] : prefersDark ? 'dark' : 'light';
})();
