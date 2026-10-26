# Market C2C

Sàn mua bán C2C (người dùng tự đăng bán đồ cho nhau), có trang quản trị.

- **Frontend:** HTML5 semantic, CSS3/SCSS, JavaScript thuần (ES Modules, Fetch API, LocalStorage)
- **Backend:** Node.js + Express 5 (REST API JSON)
- **CSDL:** MySQL 8 / MariaDB

## 1. Yêu cầu

- Node.js 18.18 trở lên (khuyên dùng bản LTS mới nhất)
- MySQL 8 hoặc MariaDB 10.4+ (có sẵn trong Laragon / XAMPP)

## 2. Cài đặt và chạy

```bash
# 1. Cài thư viện
npm install

# 2. Tạo file cấu hình
copy .env.example .env        # Windows (CMD)
# cp .env.example .env        # macOS / Linux / Git Bash
# Mở .env, sửa DB_USER / DB_PASSWORD nếu MySQL của bạn khác mặc định

# 3. Bật MySQL (Laragon: bấm "Start All"), rồi tạo database + bảng
npm run db:setup

# 4. Thêm dữ liệu mẫu
npm run db:seed

# 5. Chạy backend API (Laragon phải đang Start All để có MySQL + Apache)
npm run dev       # tự khởi động lại khi sửa code
# hoặc
npm start

# 6. (Khi sửa giao diện) biên dịch SCSS
npm run scss
```

Dự án gồm 2 phần chạy riêng:

| Phần | Địa chỉ | Chạy bởi |
|---|---|---|
| Frontend (`frontend/`) | **https://market-c2c.test** | Apache của Laragon |
| Backend API (`server/`) | https://market-c2c.test:3000 | Node.js (`npm run dev`) |

Mở trình duyệt: **https://market-c2c.test** (gõ `http://` cũng tự chuyển sang `https://`).

Cả frontend và API đều chạy **HTTPS** bằng chứng chỉ Laragon tự tạo. Cần bật trong Laragon: **Menu > Apache > SSL > Enabled** (Laragon sẽ hỏi cài chứng chỉ vào Windows, chọn Yes). API đọc chứng chỉ theo `SSL_CERT` / `SSL_KEY` trong `.env`.

> Tên miền `market-c2c.test` do Laragon tự tạo theo tên thư mục trong `www`. Nếu đổi tên thư mục hoặc chạy frontend ở địa chỉ khác (vd `https://localhost:5500`), thêm địa chỉ đó vào `CORS_ORIGINS` trong `.env`.

> Có thể import thủ công thay cho bước 3: tạo database `market_c2c` (collation `utf8mb4_unicode_ci`) rồi chạy file `database/schema.sql` trong HeidiSQL/phpMyAdmin.

## 3. Tài khoản mẫu

| Vai trò | Email | Mật khẩu |
|---|---|---|
| Admin | admin@marketc2c.vn | Admin@123 |
| Người dùng | an@example.com | 123456 |
| Người dùng | binh@example.com | 123456 |

## 4. Các lệnh

| Lệnh | Tác dụng |
|---|---|
| `npm run dev` | Chạy server, tự restart khi sửa file |
| `npm start` | Chạy server |
| `npm run scss` | Theo dõi và biên dịch SCSS → `frontend/css/main.css` |
| `npm run scss:build` | Biên dịch SCSS một lần (nén) |
| `npm run db:setup` | Tạo database và bảng (không xóa dữ liệu cũ) |
| `npm run db:seed` | Thêm dữ liệu mẫu (chỉ khi DB trống) |
| `npm run db:reset` | **Xóa toàn bộ**, tạo lại database và seed |

## 5. API hiện có

Mọi response có dạng:

```json
{ "success": true, "data": { } }
{ "success": false, "message": "...", "errors": { "email": "..." } }
```

| Method | Endpoint | Mô tả | Quyền |
|---|---|---|---|
| GET | `/api/health` | Kiểm tra server và DB | Công khai |
| POST | `/api/auth/register` | Đăng ký `{ name, email, phone?, password }` | Công khai |
| POST | `/api/auth/login` | Đăng nhập `{ email, password }` | Công khai |
| POST | `/api/auth/logout` | Đăng xuất | Công khai |
| GET | `/api/auth/me` | Thông tin tài khoản đang đăng nhập | Đăng nhập |
| GET | `/api/categories` | Danh mục kèm số tin đang bán | Công khai |
| GET | `/api/listings` | Tin đang bán. Query: `q`, `category` (id/slug), `province`, `condition` (`new|like_new|used`), `minPrice`, `maxPrice`, `sort` (`newest|price_asc|price_desc|popular`), `page`, `limit` (≤ 48) | Công khai |

Đăng nhập dùng **session + cookie httpOnly** (`mc2c.sid`, `SameSite=Lax`). Frontend (`market-c2c.test`) và API (`market-c2c.test:3000`) khác cổng nhưng cùng tên miền, nên trình duyệt coi là cùng site và vẫn gửi cookie. Điều kiện:

- Backend trả header CORS cho origin nằm trong `CORS_ORIGINS` (`server/middleware/cors.js`), có `Access-Control-Allow-Credentials: true`.
- Frontend gọi `fetch(..., { credentials: 'include' })` (đã có sẵn trong `frontend/js/services/api.js`).

## 6. Cấu trúc thư mục

```
market-c2c/
├── database/schema.sql       # Cấu trúc CSDL
├── scripts/                  # db-setup.js, seed.js
├── server/
│   ├── config/               # env.js, db.js (pool MySQL)
│   ├── controllers/          # Xử lý request
│   ├── middleware/           # auth.js, cors.js, errorHandler.js
│   ├── models/               # Câu SQL theo từng bảng
│   ├── routes/               # Khai báo endpoint
│   ├── utils/                # HttpError, validate, text, session
│   ├── app.js                # Cấu hình Express
│   └── server.js             # Điểm khởi động
├── frontend/                 # Frontend thuần HTML/SCSS/JS (Apache phục vụ)
│   ├── scss/                 # abstracts, base, layout, components, pages
│   ├── css/main.css          # File biên dịch từ SCSS
│   ├── js/                   # config, services, utils, components, pages
│   └── data/provinces.json   # Dự phòng khi API tỉnh thành lỗi
├── .htaccess                 # Apache: chỉ cho truy cập frontend/, chặn .env, server/...
└── uploads/                  # Ảnh người dùng tải lên
```

## 7. Xử lý lỗi thường gặp

- **`ECONNREFUSED`**: MySQL chưa chạy → bật MySQL trong Laragon.
- **`ER_ACCESS_DENIED_ERROR`**: sai `DB_USER` / `DB_PASSWORD` trong `.env`.
- **`ER_BAD_DB_ERROR`**: chưa tạo database → chạy `npm run db:setup`.
- **Cổng 3000 đã bị dùng**: đổi `PORT` trong `.env` và `API_PORT` trong `frontend/js/config.js`.
- **Trang báo "Không kết nối được máy chủ API"**: chưa chạy `npm run dev`, hoặc địa chỉ trang không có trong `CORS_ORIGINS`, hoặc trình duyệt chưa tin chứng chỉ (mở thử https://market-c2c.test:3000/api/health).
- **`Không đọc được chứng chỉ SSL`** khi chạy API: bật SSL trong Laragon hoặc sửa `SSL_CERT` / `SSL_KEY` trong `.env`.
- **Đăng nhập xong vẫn như chưa đăng nhập**: mở trang bằng `https://market-c2c.test` (không dùng `localhost`, vì `localhost` và `market-c2c.test` là hai site khác nhau nên cookie không dùng chung).
