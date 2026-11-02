# Market C2C

Sàn mua bán **C2C** (người dùng tự đăng bán đồ cho nhau, kiểu Chợ Tốt / Shopee) kèm trang **quản trị**.
Đồ án môn **Lập trình Web**: HTML5, CSS3/SCSS, JavaScript thuần.

- **Frontend:** HTML5 semantic, SCSS, **JavaScript thuần** (ES Modules, Fetch API, async/await, LocalStorage, Canvas API) — không dùng framework / thư viện JS, không Bootstrap CSS
- **Backend:** Node.js + Express 5 (REST API JSON) — chỉ cung cấp API
- **CSDL:** MySQL 8 / MariaDB

---

## 1. Chức năng

### Người dùng
| Trang | Đường dẫn | Chức năng chính |
|---|---|---|
| Trang chủ | `/` | Danh mục, tìm kiếm không dấu (debounce + lịch sử tìm kiếm), lọc theo khu vực / tình trạng / giá, sắp xếp, phân trang, tin vừa xem |
| Chi tiết tin | `/product?id=` | Bộ ảnh + xem phóng to (`<dialog>`), giá quy đổi USD, thêm giỏ / mua ngay / yêu thích / chia sẻ, báo cáo vi phạm, tin cùng danh mục |
| Đăng ký / đăng nhập | `/register`, `/login` | Validate theo từng ô (cùng quy tắc với server), đo độ mạnh mật khẩu (`<meter>`), ghi nhớ email |
| Đăng tin / sửa tin | `/sell`, `/sell?edit=` | Chọn / kéo thả ảnh, **nén ảnh bằng Canvas**, sắp xếp ảnh, nháp tự lưu, thẻ xem trước trực tiếp |
| Tin đăng của tôi | `/my-listings` | Lọc theo trạng thái, tìm kiếm, **sửa / xóa / đánh dấu đã bán** / ẩn / hiện / đăng bán lại |
| Giỏ hàng | `/cart` | Kiểm tra lại từng món với server, nhóm theo người bán, đặt hàng (mỗi món 1 đơn) |
| Đơn hàng | `/orders` | Đơn mua / đơn bán, thanh tiến trình, xác nhận → giao → **hoàn thành** (tin tự chuyển "đã bán"), hủy |
| Tin yêu thích | `/favorites` | Lưu trong LocalStorage, tìm kiếm / sắp xếp, đánh dấu tin đã bán |

### Quản trị (`/admin/`, tài khoản admin)
| Trang | Chức năng |
|---|---|
| Tổng quan | 6 thẻ chỉ số + **4 biểu đồ vẽ bằng Canvas API** (cột, đường, vành khuyên, thanh ngang), tooltip, đổi 7 / 14 / 30 ngày |
| Duyệt tin | Duyệt / từ chối (bắt buộc lý do, có lý do gợi ý) / gỡ tin |
| Người dùng | Tìm kiếm, khóa / mở khóa tài khoản |
| Danh mục | Thêm / sửa / xóa danh mục, chọn icon có xem trước |
| Báo cáo vi phạm | Bỏ qua / đã xử lý / gỡ tin vi phạm |

Giao diện **sáng / tối** (lưu bằng cookie), **responsive** từ 320px tới desktop (3 breakpoint: 576 / 768 / 1200px).

---

## 2. Đáp ứng yêu cầu của đề

| Yêu cầu | Thể hiện ở đâu |
|---|---|
| HTML5 semantic | `header`, `nav`, `main`, `section`, `article`, `aside`, `footer`, `dialog`, `details/summary`, `template`, `picture`, `meter`, `dl`, `time`, `figure`... |
| SCSS: biến, nesting, mixin, partials | `frontend/scss/`: `abstracts/_variables`, `_mixins` (`respond-to`, `surface`, `line-clamp`, `scroll-x`...), `@use` / `@forward`, `@each` sinh class màu |
| Responsive ≥ 2 breakpoint | 3 breakpoint (mixin `respond-to` / `respond-below`), bảng admin tự thành thẻ trên điện thoại |
| JS tách file, ES Modules, có comment | `frontend/js/`: `services/` (gọi API, storage), `components/`, `utils/`, `pages/` (mỗi trang 1 file) |
| Hiển thị danh sách | Trang chủ, tin của tôi, đơn hàng, các trang admin |
| Thêm / sửa / xóa | Tin đăng (`/sell`, `/my-listings`), danh mục (admin) |
| **Đánh dấu hoàn thành** | Tin "đã bán", đơn hàng "hoàn thành" |
| Lọc theo trạng thái + tìm kiếm | Tab trạng thái có số đếm + ô tìm kiếm (debounce) ở trang chủ, tin của tôi, đơn hàng, admin |
| **LocalStorage có vai trò thật** | Giỏ hàng, yêu thích, tin vừa xem, lịch sử tìm kiếm, nháp đăng tin, ghi nhớ email, thông tin nhận hàng, cache API có hạn dùng (mục 6) |
| **Gọi API công khai** (fetch + async/await, try/catch, loading, lỗi, dự phòng) | Tỉnh thành `provinces.open-api.vn` (dự phòng `data/provinces.json`), tỷ giá `open.er-api.com` (lỗi thì ẩn phần USD) |

Một số kỹ thuật JavaScript nâng cao đã dùng:
- **Class / kế thừa:** `BaseChart` → `BarChart`, `LineChart`, `HBarChart`, `DonutChart`; `FormHandler`, `ImagePicker`, `Gallery`, `ListStore`.
- **Event delegation, `CustomEvent`** giữa các module (`cart:change`, `favorites:change`, `theme:change`) và đồng bộ giữa các tab (sự kiện `storage`).
- **`Promise.all` / `Promise.allSettled`, `AbortController`** (hủy request cũ khi lọc liên tục), **debounce**.
- **`FormData`** gửi ảnh, **Canvas API** nén ảnh và vẽ biểu đồ, **`ResizeObserver`**, **`URL.createObjectURL`**, **HTML5 Drag & Drop**, **Web Share / Clipboard API**.
- `filter / map / reduce / sort`, destructuring, spread, template literal, optional chaining.
- **Không dùng `innerHTML`** với dữ liệu: component viết sẵn trong `<template>`, JS nhân bản rồi gán `textContent` (tự chống XSS).

---

## 3. Cài đặt và chạy

Yêu cầu: **Node.js 18.18+**, **Laragon** (MySQL 8 / MariaDB 10.4+ và Apache).

```bash
# 1. Cài thư viện
npm install

# 2. Tạo file cấu hình
copy .env.example .env        # Windows (CMD)
# cp .env.example .env        # Git Bash / macOS / Linux
# Mở .env, sửa DB_USER / DB_PASSWORD nếu MySQL của bạn khác mặc định

# 3. Bật Laragon (Start All), rồi tạo database + bảng
npm run db:setup

# 4. Thêm dữ liệu mẫu
npm run db:seed

# 5. Chạy backend API
npm run dev       # tự khởi động lại khi sửa code (hoặc: npm start)

# 6. (Khi sửa giao diện) biên dịch SCSS
npm run scss
```

Dự án gồm 2 phần chạy riêng:

| Phần | Địa chỉ | Chạy bởi |
|---|---|---|
| Frontend (`frontend/`) | **https://market-c2c.test** | Apache của Laragon |
| Backend API (`server/`) | https://market-c2c.test:3000 | Node.js (`npm run dev`) |

Mở trình duyệt: **https://market-c2c.test** (gõ `http://` cũng tự chuyển sang `https://`).

- Cả frontend và API chạy **HTTPS** bằng chứng chỉ Laragon tự tạo. Bật trong Laragon: **Menu > Apache > SSL > Enabled** (Laragon hỏi cài chứng chỉ vào Windows, chọn Yes). API đọc chứng chỉ theo `SSL_CERT` / `SSL_KEY` trong `.env`.
- **Laragon cài ở ổ C:** `.env.example` đang ghi đường dẫn ổ D, hãy sửa trong `.env` thành `SSL_CERT=C:/laragon/etc/ssl/laragon.crt` và `SSL_KEY=C:/laragon/etc/ssl/laragon.key` (file mẫu có sẵn 2 dòng này), nếu không API sẽ báo không đọc được chứng chỉ.
- **Giữ đúng tên thư mục `market-c2c`** trong `www` của Laragon để có địa chỉ `https://market-c2c.test`.
- Tên miền `market-c2c.test` do Laragon tự tạo theo tên thư mục trong `www`. Đổi tên thư mục hoặc chạy frontend ở địa chỉ khác thì thêm địa chỉ đó vào `CORS_ORIGINS` trong `.env`.
- Có thể import thủ công thay cho bước 3: tạo database `market_c2c` (collation `utf8mb4_unicode_ci`) rồi chạy `database/schema.sql` trong HeidiSQL / phpMyAdmin.

### Tài khoản mẫu

| Vai trò | Email | Mật khẩu |
|---|---|---|
| Admin | admin@marketc2c.vn | Admin@123 |
| Người dùng | an@example.com | 123456 |
| Người dùng | binh@example.com | 123456 |
| Người dùng | cuong@example.com | 123456 |
| Người dùng | dung@example.com | 123456 |
| Người dùng (bị khóa) | huy@example.com | 123456 |

Dữ liệu mẫu gồm 29 tin đăng có ảnh thật (đủ 5 trạng thái), 9 đơn hàng ở mọi trạng thái rải trong 2 tuần gần đây (để biểu đồ admin có số liệu) và 3 báo cáo vi phạm. Ảnh mẫu lấy từ Unsplash, nằm trong `database/seed-images/` (nguồn ghi ở `CREDITS.md`), khi seed được chép vào `uploads/listings/`.

### Các lệnh

| Lệnh | Tác dụng |
|---|---|
| `npm run dev` | Chạy API, tự restart khi sửa file |
| `npm start` | Chạy API |
| `npm run scss` | Theo dõi và biên dịch SCSS → `frontend/css/main.css` |
| `npm run scss:build` | Biên dịch SCSS một lần (nén) |
| `npm run db:setup` | Tạo database và bảng (không xóa dữ liệu cũ) |
| `npm run db:seed` | Thêm dữ liệu mẫu (chỉ khi DB trống) |
| `npm run db:reset` | **Xóa toàn bộ** database và ảnh trong `uploads/listings`, tạo lại và seed |

---

## 4. Kiến trúc

```
Trình duyệt ──https──▶ Apache (Laragon)  : frontend/ (HTML, CSS, JS tĩnh)
     │
     └──fetch + cookie──▶ Node/Express :3000 : /api/... ──▶ MySQL
                                              /uploads/... (ảnh)
```

- Frontend và API **khác origin** (khác cổng) nhưng **cùng site** (cùng tên miền) nên cookie đăng nhập (`httpOnly`, `Secure`, `SameSite=Lax`) vẫn được gửi. Backend bật **CORS** bằng middleware tự viết (`server/middleware/cors.js`, chỉ cho phép địa chỉ trong `CORS_ORIGINS`), frontend `fetch` với `credentials: 'include'`.
- Backend: `routes → controllers → models`. SQL chỉ nằm trong `models/`, luôn dùng placeholder `?`. Lỗi trả về thống nhất `{ success: false, message, errors? }`.
- **Upload ảnh không dùng thư viện**: đọc `FormData` bằng Web API có sẵn của Node (`Request.formData()`), kiểm tra **magic bytes** (JPG / PNG / WebP), tên file ngẫu nhiên. Ảnh chỉ được lưu khi bấm Đăng; lưu database lỗi thì tự xóa ảnh vừa ghi.
- Đặt hàng trong **transaction** + `SELECT ... FOR UPDATE` để 2 người không đặt trùng 1 món.
- `.htaccess` chỉ cho truy cập thư mục `frontend/`, chặn `.env`, `server/`, `database/`...

### Cấu trúc thư mục

```
market-c2c/
├── database/
│   ├── schema.sql               # Cấu trúc CSDL
│   └── seed-images/             # Ảnh dữ liệu mẫu (Unsplash)
├── scripts/                     # db-setup.js, seed.js
├── server/
│   ├── config/                  # env.js, db.js (pool MySQL, transaction)
│   ├── controllers/             # auth, category, listing, order, report, admin
│   ├── middleware/              # auth.js, cors.js, errorHandler.js
│   ├── models/                  # SQL theo từng bảng
│   ├── routes/                  # Khai báo endpoint
│   ├── utils/                   # HttpError, validate, text, multipart, image-store
│   ├── app.js                   # Cấu hình Express
│   └── server.js                # Khởi động HTTPS
├── frontend/
│   ├── *.html                   # Trang người dùng
│   ├── admin/*.html             # Trang quản trị
│   ├── scss/                    # abstracts, base, layout, components, pages
│   ├── css/main.css             # File biên dịch từ SCSS
│   ├── js/
│   │   ├── config.js            # Địa chỉ API
│   │   ├── services/            # api (wrapper fetch), storage, auth, catalog, orders, admin...
│   │   ├── components/          # header, form, gallery, image-picker, charts, dialog, toast...
│   │   ├── utils/               # template, dom, format, validators, image, cookie
│   │   └── pages/               # Mỗi trang 1 file (admin/ riêng)
│   ├── assets/images/           # Logo, favicon
│   └── data/provinces.json      # Dự phòng khi API tỉnh thành lỗi
├── .htaccess                    # Apache: chỉ cho truy cập frontend/
└── uploads/                     # Ảnh người dùng tải lên (không đưa lên git)
```

---

## 5. API

Mọi response có dạng `{ "success": true, "data": ..., "message"?, "meta"? }` hoặc `{ "success": false, "message": "...", "errors"?: { "field": "..." } }`.

| Method | Endpoint | Mô tả | Quyền |
|---|---|---|---|
| GET | `/api/health` | Kiểm tra server và DB | Công khai |
| POST | `/api/auth/register` · `/login` · `/logout` | Đăng ký / đăng nhập / đăng xuất | Công khai |
| GET | `/api/auth/me` | Tài khoản đang đăng nhập | Đăng nhập |
| GET | `/api/categories` | Danh mục kèm số tin đang bán | Công khai |
| GET | `/api/listings` | Tin đang bán. Query: `q, category, province, condition, minPrice, maxPrice, sort, page, limit, exclude` | Công khai |
| GET | `/api/listings/:id` | Chi tiết tin (+ ảnh, người bán, `reserved`) | Công khai |
| POST | `/api/listings` | Đăng tin (FormData + 1–6 ảnh) | Đăng nhập |
| PUT | `/api/listings/:id` | Sửa tin (FormData + `imageOrder`) | Chủ tin |
| PATCH | `/api/listings/:id/status` | Đã bán / ẩn / hiện / đăng bán lại | Chủ tin |
| DELETE | `/api/listings/:id` | Xóa tin (không xóa được nếu đã có đơn) | Chủ tin |
| GET | `/api/me/listings` | Tin của tôi (`status, q, page`) | Đăng nhập |
| POST | `/api/orders` | Đặt hàng `{ listingIds[], receiverName, receiverPhone, address, province, note? }` | Đăng nhập |
| GET | `/api/orders` | Đơn mua / đơn bán (`role=buyer\|seller, status, page`) | Đăng nhập |
| GET | `/api/orders/summary` | Số đơn cần xử lý | Đăng nhập |
| GET | `/api/orders/:id` | Chi tiết đơn | Người mua / bán |
| PATCH | `/api/orders/:id/status` | Xác nhận / giao / hoàn thành / hủy | Người mua / bán |
| POST | `/api/reports` | Báo cáo tin vi phạm `{ listingId, reason }` | Đăng nhập |
| GET | `/api/admin/stats` | Thống kê dashboard (`days`) | Admin |
| GET / PATCH | `/api/admin/listings`, `/api/admin/listings/:id/review` | Danh sách tin, duyệt / từ chối | Admin |
| GET / PATCH | `/api/admin/users`, `/api/admin/users/:id/status` | Người dùng, khóa / mở khóa | Admin |
| GET / POST / PUT / DELETE | `/api/admin/categories[/:id]` | Quản lý danh mục | Admin |
| GET / PATCH | `/api/admin/reports[/:id]` | Báo cáo vi phạm, xử lý | Admin |

**Vòng đời tin đăng:** `pending` (chờ duyệt) → `active` (đang bán) → `sold` (đã bán) | `hidden` (người bán ẩn) | `rejected` (admin từ chối, có lý do).
**Vòng đời đơn hàng:** `pending` → `confirmed` → `shipping` → `completed` (tin chuyển `sold`), hoặc `cancelled`.

---

## 6. Lưu trữ phía trình duyệt

Mọi key có tiền tố `mc2c:`, bọc trong `frontend/js/services/storage.js` (try/catch + JSON an toàn).

| Nơi lưu | Key | Dùng để |
|---|---|---|
| LocalStorage | `cart` | Giỏ hàng |
| LocalStorage | `favorites` | Tin yêu thích |
| LocalStorage | `recentlyViewed` | Tin vừa xem (trang chủ) |
| LocalStorage | `searchHistory` | Lịch sử tìm kiếm |
| LocalStorage | `listingDraft` | Nháp đăng tin (F5 không mất) |
| LocalStorage | `rememberEmail` | Ghi nhớ email đăng nhập |
| LocalStorage | `shippingInfo` | Thông tin nhận hàng lần trước |
| LocalStorage | `cache:*` | Cache API có hạn dùng: danh mục (10 phút), tỉnh thành (7 ngày), tỷ giá (6 giờ) |
| SessionStorage | `homeFilters` | Bộ lọc trang chủ khi quay lại |
| SessionStorage | `flash` | Thông báo hiện ở trang kế tiếp |
| Cookie | `mc2c_theme` | Giao diện sáng / tối |

---

## 7. Xử lý lỗi thường gặp

- **`ECONNREFUSED`**: MySQL chưa chạy → bật Laragon.
- **`ER_ACCESS_DENIED_ERROR`**: sai `DB_USER` / `DB_PASSWORD` trong `.env`.
- **`ER_BAD_DB_ERROR`**: chưa tạo database → `npm run db:setup`.
- **Cổng 3000 đã bị dùng**: đổi `PORT` trong `.env` và `API_PORT` trong `frontend/js/config.js`.
- **"Không kết nối được máy chủ API"**: chưa chạy `npm run dev`, địa chỉ trang không có trong `CORS_ORIGINS`, hoặc trình duyệt chưa tin chứng chỉ (mở thử https://market-c2c.test:3000/api/health).
- **`Không đọc được chứng chỉ SSL`** khi chạy API: bật SSL trong Laragon hoặc sửa `SSL_CERT` / `SSL_KEY` trong `.env`.
- **Đăng nhập xong vẫn như chưa đăng nhập**: mở bằng `https://market-c2c.test` (không dùng `localhost` — khác site nên cookie không dùng chung).
- **Giao diện chưa đổi sau khi sửa**: nhấn **Ctrl + F5** (trình duyệt còn giữ CSS / JS cũ).
