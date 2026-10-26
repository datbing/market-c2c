-- =========================================================
--  MARKET C2C - CẤU TRÚC CƠ SỞ DỮ LIỆU (MySQL 8 / MariaDB 10.4+)
--  Charset utf8mb4 để lưu tiếng Việt và emoji.
--  Nếu import thủ công (HeidiSQL/phpMyAdmin): tạo database `market_c2c`
--  với collation utf8mb4_unicode_ci, chọn database đó rồi chạy file này.
-- =========================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------
-- Người dùng (vừa là người mua vừa là người bán) + admin
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(100) NOT NULL,
  email          VARCHAR(150) NOT NULL UNIQUE,
  phone          VARCHAR(15)  NULL,
  password_hash  VARCHAR(255) NOT NULL,
  avatar         VARCHAR(255) NULL,
  province       VARCHAR(100) NULL,
  role           ENUM('user', 'admin')     NOT NULL DEFAULT 'user',
  status         ENUM('active', 'locked')  NOT NULL DEFAULT 'active',
  last_login_at  DATETIME NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_role_status (role, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------
-- Danh mục sản phẩm
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  slug        VARCHAR(120) NOT NULL UNIQUE,
  icon        VARCHAR(50)  NULL COMMENT 'Tên class Bootstrap Icons, vd: bi-phone',
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------
-- Tin đăng bán (mỗi tin là 1 món đồ của 1 người bán)
--   pending  : chờ admin duyệt
--   active   : đang bán
--   sold     : đã bán (= "đánh dấu hoàn thành")
--   hidden   : người bán tạm ẩn
--   rejected : admin từ chối
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS listings (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       INT UNSIGNED NOT NULL,
  category_id   INT UNSIGNED NOT NULL,
  title         VARCHAR(150) NOT NULL,
  description   TEXT NOT NULL,
  price         INT UNSIGNED NOT NULL COMMENT 'Đơn vị VND',
  item_condition ENUM('new', 'like_new', 'used') NOT NULL DEFAULT 'used',
  province      VARCHAR(100) NOT NULL,
  status        ENUM('pending', 'active', 'sold', 'hidden', 'rejected') NOT NULL DEFAULT 'pending',
  reject_reason VARCHAR(255) NULL,
  search_text   TEXT NOT NULL COMMENT 'Tiêu đề + mô tả đã bỏ dấu, chữ thường',
  views         INT UNSIGNED NOT NULL DEFAULT 0,
  sold_at       DATETIME NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_listings_status_created (status, created_at),
  INDEX idx_listings_category (category_id),
  INDEX idx_listings_user (user_id),
  CONSTRAINT fk_listings_user     FOREIGN KEY (user_id)     REFERENCES users(id)      ON DELETE CASCADE,
  CONSTRAINT fk_listings_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------
-- Ảnh của tin đăng (1 tin có nhiều ảnh)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS listing_images (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  listing_id  INT UNSIGNED NOT NULL,
  path        VARCHAR(255) NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_images_listing (listing_id, sort_order),
  CONSTRAINT fk_images_listing FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------
-- Đơn hàng: người mua đặt mua một tin đăng
--   Lưu "ảnh chụp" tiêu đề và giá tại thời điểm đặt (listing_title, price)
--   để người bán sửa tin sau này không làm sai lịch sử đơn.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  listing_id     INT UNSIGNED NOT NULL,
  buyer_id       INT UNSIGNED NOT NULL,
  seller_id      INT UNSIGNED NOT NULL,
  listing_title  VARCHAR(150) NOT NULL,
  price          INT UNSIGNED NOT NULL,
  receiver_name  VARCHAR(100) NOT NULL,
  receiver_phone VARCHAR(15)  NOT NULL,
  address        VARCHAR(255) NOT NULL,
  province       VARCHAR(100) NOT NULL,
  note           VARCHAR(500) NULL,
  status         ENUM('pending', 'confirmed', 'shipping', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
  completed_at   DATETIME NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_orders_buyer (buyer_id, created_at),
  INDEX idx_orders_seller (seller_id, created_at),
  INDEX idx_orders_status (status),
  CONSTRAINT fk_orders_listing FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE RESTRICT,
  CONSTRAINT fk_orders_buyer   FOREIGN KEY (buyer_id)   REFERENCES users(id)    ON DELETE RESTRICT,
  CONSTRAINT fk_orders_seller  FOREIGN KEY (seller_id)  REFERENCES users(id)    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------
-- Báo cáo vi phạm tin đăng (admin xử lý)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  listing_id   INT UNSIGNED NOT NULL,
  reporter_id  INT UNSIGNED NOT NULL,
  reason       VARCHAR(500) NOT NULL,
  status       ENUM('open', 'resolved', 'dismissed') NOT NULL DEFAULT 'open',
  resolved_at  DATETIME NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_reports_status (status, created_at),
  CONSTRAINT fk_reports_listing  FOREIGN KEY (listing_id)  REFERENCES listings(id) ON DELETE CASCADE,
  CONSTRAINT fk_reports_reporter FOREIGN KEY (reporter_id) REFERENCES users(id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
