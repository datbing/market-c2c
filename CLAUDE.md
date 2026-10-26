# CLAUDE.md — Market C2C

Luôn trả lời và viết comment code bằng **tiếng Việt**. Làm theo từng feature, đưa code đầy đủ chạy được, không đưa snippet dở dang.

## Bối cảnh

Đồ án tiểu luận môn Lập trình Web (HTML5, CSS3/SCSS, JavaScript). Sàn mua bán **C2C** kiểu Shopee/Chợ Tốt: người dùng tự đăng bán đồ cho nhau, có trang **admin** quản lý.
Trọng tâm chấm điểm là **JavaScript nâng cao** (DOM, sự kiện, Fetch API, async/await, LocalStorage). Backend chỉ là phần phụ để cung cấp API.

### Yêu cầu bắt buộc của đề (KHÔNG được vi phạm)
- **Frontend dùng JavaScript thuần.** Cấm React/Vue/Angular/jQuery/Alpine, cấm Bootstrap CSS/Tailwind. Được dùng Bootstrap Icons qua CDN. Biểu đồ admin vẽ bằng **Canvas API** (không dùng Chart.js trừ khi được xác nhận).
- HTML5 **semantic** (`header`, `nav`, `main`, `section`, `article`, `aside`, `footer`, `dialog`...).
- **SCSS** có dùng biến, nesting, mixin, partials (`@use`). Responsive tối thiểu 2 breakpoint (dự án dùng 3).
- JS **tách file riêng**, ES Modules, **có comment**.
- Chức năng: hiển thị danh sách; thêm/sửa/xóa; **đánh dấu hoàn thành** (= tin đăng "đã bán", đơn hàng "hoàn thành"); lọc theo trạng thái + tìm kiếm từ khóa.
- **LocalStorage phải có vai trò thật** (xem mục LocalStorage). Có thể kết hợp SessionStorage/Cookie.
- Gọi ít nhất một **API công khai** bằng `fetch` + `async/await`, có `try/catch`, trạng thái loading, thông báo lỗi và fallback.

## Stack

- Backend: **Node.js + Express 5** (ESM, `"type": "module"`), **MySQL** qua `mysql2/promise`, `express-session`, `bcryptjs`, `dotenv`. **Không dùng `multer`** (xem mục Upload ảnh).
- **Tách riêng 2 phần:**
  - Backend `server/` = **chỉ API** (Node/Express) tại `https://market-c2c.test:3000`. Không phục vụ HTML.
  - Frontend `frontend/` = HTML5 + SCSS + JS thuần, do **Apache của Laragon** phục vụ tại `https://market-c2c.test` (`.htaccess` ở gốc dự án ép http → https, ánh xạ URL vào `frontend/` và chặn `.env`, `server/`...).
  - **Toàn bộ HTTPS.** API Node dùng `https.createServer` với chứng chỉ Laragon (`SSL_CERT`/`SSL_KEY` trong `.env`, mặc định `D:/laragon/etc/ssl/laragon.{crt,key}`, đã có SAN `*.test`). Cookie session `Secure`.
  - Khác origin (khác cổng) nhưng **cùng site** → cookie session `SameSite=Lax` vẫn gửi được. Backend bật CORS bằng middleware tự viết `server/middleware/cors.js` (whitelist `CORS_ORIGINS` trong `.env`), frontend `fetch` với `credentials: 'include'`.
  - URL API lấy từ `frontend/js/config.js` (`API_BASE`, `assetUrl()` cho ảnh `/uploads`). Không gọi URL `http://` từ trang (bị chặn mixed content).
- Môi trường dev: **Windows + Laragon** (MySQL user `root`, không mật khẩu). Lệnh hướng dẫn phải chạy được trên Windows.

## Lệnh

```bash
npm install
npm run dev          # API: node --watch, https://market-c2c.test:3000 (frontend: https://market-c2c.test, cần Apache Laragon chạy)
npm run db:setup     # tạo DB + bảng từ database/schema.sql
npm run db:seed      # dữ liệu mẫu (chỉ khi bảng users trống)
npm run db:reset     # XÓA DB rồi tạo lại + seed — hỏi trước khi chạy
npm run scss         # theo dõi + biên dịch frontend/scss/main.scss -> frontend/css/main.css
npm run scss:build   # biên dịch 1 lần, nén (chạy trước khi nộp bài)
```
`frontend/css/main.css` là file sinh ra: sửa SCSS rồi biên dịch lại, không sửa tay file CSS.

Tài khoản seed: `admin@marketc2c.vn / Admin@123`, `an@example.com / 123456`, `binh@example.com / 123456`.

## Cấu trúc

```
database/schema.sql         # nguồn sự thật của CSDL; sửa bảng thì sửa ở đây + seed.js
scripts/db-setup.js, seed.js
server/
  config/env.js, db.js      # config + pool, helper query/queryOne/withTransaction
  controllers/              # xử lý request, không viết SQL
  middleware/auth.js        # requireAuth, optionalAuth, requireAdmin
  middleware/errorHandler.js
  middleware/cors.js        # CORS whitelist (CORS_ORIGINS) cho frontend
  models/                   # toàn bộ SQL theo bảng + hàm toXxx() map sang camelCase
  routes/                   # mỗi module 1 file, gắn trong routes/index.js
  utils/                    # HttpError, validate (rules), text (toSearchText, slugify), session
frontend/                   # frontend thuần (Apache phục vụ)
.htaccess                   # Apache: map URL -> frontend/, chặn file nhạy cảm
uploads/                    # ảnh upload (gitignored)
```

## Quy ước backend

- Luồng: `routes → controllers → models`. SQL chỉ nằm trong `models/`.
- **Express 5 tự bắt lỗi async**: controller không bọc try/catch, chỉ `throw HttpError.notFound(...)` / `HttpError.forbidden(...)`...
- Validate bằng `validate(req.body, { field: [rules.required(), ...] })` → tự ném 422 kèm `errors` theo từng trường.
- SQL luôn dùng placeholder `?`. **Không bao giờ** nối chuỗi giá trị người dùng vào SQL. Tên cột sắp xếp phải lấy từ whitelist.
- DB dùng `snake_case`, JSON trả về dùng `camelCase` (qua `toXxx()` trong model). Không trả `password_hash`.
- Response thống nhất:
  - Thành công: `{ success: true, data, message?, meta? }` (`meta` cho phân trang: `{ page, limit, total, totalPages }`)
  - Lỗi: `{ success: false, message, errors? }`
- Thông báo lỗi viết tiếng Việt, thân thiện.
- Kiểm tra quyền sở hữu: user chỉ sửa/xóa tin của chính mình; admin có route riêng dưới `/api/admin`.
- Khi tạo/sửa tin đăng phải cập nhật `search_text = toSearchText(title, description)` để tìm kiếm không dấu.

## CSDL (tóm tắt)

- `users` — role `user|admin`, status `active|locked`.
- `categories` — name, slug, icon (class Bootstrap Icons), sort_order.
- `listings` — tin đăng (1 món đồ của 1 người bán, không có tồn kho). `item_condition`: `new|like_new|used`. `status`:
  `pending` (chờ duyệt) → `active` (đang bán) → `sold` (đã bán) | `hidden` (người bán ẩn) | `rejected` (admin từ chối, có `reject_reason`).
- `listing_images` — nhiều ảnh/tin, `sort_order`, xóa theo tin (CASCADE).
- `orders` — lưu snapshot `listing_title`, `price`. `status`: `pending → confirmed → shipping → completed`, hoặc `cancelled`.
- `reports` — báo cáo vi phạm, `open|resolved|dismissed`.

> Vấn đề đang cân nhắc: có thể đổi `listings` → `products` (và thêm `stock`). **Chưa quyết, hỏi lại trước khi đổi tên.**

## API

Đã có:
| Method | Endpoint | Quyền |
|---|---|---|
| GET | `/api/health` | công khai |
| POST | `/api/auth/register`, `/login`, `/logout` | công khai |
| GET | `/api/auth/me` | đăng nhập |
| GET | `/api/categories` | công khai |
| GET | `/api/listings?q=&category=&province=&condition=&minPrice=&maxPrice=&sort=&page=&limit=&exclude=` | công khai |
| GET | `/api/listings/:id` | công khai (optionalAuth) |

`/api/listings`: chỉ tin `active` của user chưa khóa. `category` nhận id hoặc slug, `province` so khớp một phần (LIKE), `sort` ∈ `newest|price_asc|price_desc|popular`, `limit` ≤ 48. Mỗi tin có `thumbnail` (ảnh đầu tiên hoặc null), `category{id,name,slug,icon}`, `seller{id,name}`. `exclude` = bỏ 1 id (tin cùng danh mục).

`/api/listings/:id`: `active` + `sold` ai cũng xem; `pending|hidden|rejected` chỉ chủ tin/admin (người khác 404). Tăng `views` khi tin active và người xem không phải chủ. Trả thêm `description`, `images[{id,url}]`, `seller{id,name,avatar,province,joinedAt,activeCount,soldCount}`, `isOwner`, `rejectReason` (chỉ chủ/admin).

Dự kiến:
- Listings: `GET /api/listings?q=&category=&province=&condition=&minPrice=&maxPrice=&sort=&page=&limit=` (chỉ `active`), `GET /api/me/listings?status=`, `POST /api/listings` (FormData: thông tin + ảnh trong 1 request), `PUT /api/listings/:id`, `PATCH /api/listings/:id/status` (sold/hidden/active), `DELETE /api/listings/:id` (không cho xóa nếu đã có đơn, gợi ý ẩn).
- Orders: tạo đơn từ tin `active`, người mua xem đơn mua, người bán xem đơn bán và chuyển trạng thái; hoàn thành đơn thì tin chuyển `sold`.
- Reports: người dùng báo cáo tin.
- Admin (`/api/admin`): thống kê dashboard, duyệt/từ chối tin, khóa/mở user, CRUD danh mục, xử lý báo cáo.

### Upload ảnh (đã chốt, không dùng multer)
- Ảnh **chỉ lưu vào `uploads/` khi bấm Đăng / Lưu tin**, không upload trước → không có ảnh mồ côi.
- Frontend: `<input type="file" accept="image/*" multiple>` → nén bằng Canvas (tối đa ~1280px, WebP/JPEG) → giữ Blob trong bộ nhớ, xem trước bằng `URL.createObjectURL` (nhớ `revokeObjectURL`), cho xóa/sắp xếp → khi submit gửi **1 request `FormData`** (các trường chữ + `images`).
- Backend: đọc multipart bằng **Web API có sẵn của Node** (`new Request(...).formData()`), không thêm thư viện. Giới hạn tổng dung lượng request + số ảnh/tin (~6) + dung lượng/ảnh; kiểm tra **magic bytes** (JPEG/PNG/WebP), không tin đuôi file / Content-Type; tên file ngẫu nhiên (`crypto.randomUUID`).
- Ghi file rồi insert DB trong transaction; **DB lỗi thì xóa các file vừa ghi**. Sửa tin: xóa ảnh cũ bị bỏ khỏi đĩa sau khi commit.
- Nháp đăng tin (`listingDraft`, LocalStorage) chỉ lưu phần chữ, không lưu ảnh (báo rõ cho người dùng).

## Quy ước frontend

- Cấu trúc dự kiến:
  ```
  frontend/
    index.html, product.html, sell.html, cart.html, orders.html, login.html, register.html
    admin/index.html ...
    scss/abstracts (_variables, _mixins) | base | components | layout | pages | main.scss
    css/main.css            # file biên dịch
    js/config.js            # API_BASE, assetUrl()
    js/services/            # api.js (wrapper fetch), storage.js, auth.js...
    js/utils/               # template (cloneTemplate, fillFields), dom ($, debounce), format VND, cookie
    js/components/          # render card, modal, toast...
    js/pages/               # mỗi trang 1 file entry
  ```
- Mọi request backend đi qua wrapper `js/services/api.js` (async/await, parse JSON, ném lỗi có `message` + `errors`).
- Breakpoint: mobile `< 576px`, tablet `≥ 768px`, desktop `≥ 1200px` (mixin `respond-to` / `respond-below`, mobile-first). Màu chủ đạo cam `#ee4d2d`.
- **Màu chỉ lấy từ biến CSS trong `scss/base/_theme.scss`** (`--color-*`, `--header-*`, `--hero-*`, `--btn-white-*`, `--fav-*`...), không viết màu cứng trong component, để dark theme tự đúng. Dark theme: xám ngả lạnh nhiều lớp, cam chỉ làm điểm nhấn (không phủ cả khối), `--color-primary` sáng hơn (#ff6a3d).
  - Logo có 2 bản: `logo-text.png` (chữ navy, nền sáng) và `logo-text-dark.png` (chữ sáng, nền tối); dùng class `logo__picture--light` / `logo__picture--dark`, CSS chọn theo `[data-theme]`.
- Responsive đã thống nhất (giữ cho các trang sau):
  - Grid cha luôn `grid-template-columns: minmax(0, 1fr)` để con không đẩy tràn ngang; kiểm tra ở 320 / 375 / 768 / 1024 / 1280px, không được có thanh cuộn ngang.
  - Header: < 768px 2 hàng (logo + nút | ô tìm kiếm); ≥ 768px 1 hàng; < 1200px nút "Đăng nhập", "Đăng tin" chỉ hiện icon (chữ `visually-hidden`).
  - Logo dùng `<picture>`: < 576px `logo.png` (vuông), lớn hơn `logo-text.png`. Ảnh dùng đường dẫn tuyệt đối `/assets/images/...`.
  - Lưới tin 2 / 3 (≥ 576) / 4 (≥ 1200) cột; dải cuộn ngang dùng mixin `scroll-x`; bộ lọc là ngăn kéo < 1200px, cột cố định ≥ 1200px.
- **Component = HTML + CSS + JS tách bạch, không viết HTML trong chuỗi JS:**
  - Phần tĩnh (header, footer, menu tài khoản, trạng thái trống/lỗi, nút phân trang trước/sau, option cố định) viết sẵn trong `.html`, JS chỉ bật/tắt `hidden` và điền chữ.
  - Phần lặp lại (thẻ tin, ô danh mục, chip, toast, mục lịch sử...) đặt trong `<template id="tpl-...">` của trang; JS dùng `cloneTemplate(id)` + `fillFields(root, data)` (`js/utils/template.js`) và gán bằng `textContent` → tự an toàn XSS. **Không dùng `innerHTML`** với dữ liệu.
  - Hiển thị theo trạng thái để CSS lo (vd icon tim theo `aria-pressed`, icon theme theo `[data-theme]`), JS chỉ đổi thuộc tính.
  - Header, footer, `#toast-stack` và template dùng chung (`tpl-history-item`, `tpl-toast`, `tpl-listing-card` nếu trang có thẻ tin) phải **copy sang mọi trang** (HTML thuần không có include); lấy `index.html` làm bản gốc.
  - Nút yêu thích dùng `components/favorite.js` (`toggleFavorite`, `watchFavorites`); snapshot giỏ/yêu thích/đã xem tạo bằng `toListingSnapshot()` (có `sellerId`, `sellerName`).
- Kỹ thuật JS nên thể hiện: class/module, event delegation, debounce tìm kiếm, `filter/map/reduce`, destructuring/spread, template literal, `CustomEvent` giữa các module, `Promise.all/allSettled`, `FormData` upload ảnh.

### LocalStorage / SessionStorage / Cookie
Prefix key `mc2c:`. Bọc trong `storage.js` có try/catch + JSON parse an toàn.
- LocalStorage: `cart` (giỏ hàng), `favorites`, `recentlyViewed`, `searchHistory`, `listingDraft` (nháp form đăng tin, F5 không mất), `rememberEmail` (ghi nhớ email ở trang đăng nhập), `cache:*` (cache API có TTL: danh mục, tỉnh thành, tỷ giá).
- SessionStorage: trạng thái lọc/trang hiện tại khi quay lại danh sách (`homeFilters`); `flash` = thông báo để lại trước khi chuyển trang (`services/flash.js`, header tự hiện toast rồi xóa).
- Cookie: theme sáng/tối (session đăng nhập do server quản lý bằng cookie httpOnly).

### API công khai
- `https://provinces.open-api.vn/api/` — chọn tỉnh/thành (form đăng tin, đặt hàng, bộ lọc). Fallback: `frontend/data/provinces.json`.
- `https://open.er-api.com/v6/latest/USD` — hiện giá quy đổi USD. Lỗi thì ẩn phần quy đổi, không làm hỏng trang.
- Gọi song song bằng `Promise.allSettled`, có loading + thông báo lỗi.

## Tiến độ

- [x] Khung backend, kết nối MySQL, schema + seed
- [x] Auth (session), categories
- [ ] Module listings — đã có `GET /api/listings` (lọc/tìm kiếm/phân trang); còn chi tiết, CRUD, upload ảnh, đánh dấu đã bán
- [ ] Orders
- [ ] Reports
- [ ] Admin API
- [x] Frontend: SCSS base + layout + components, header/footer dùng chung, trang chủ (`index.html` + `js/pages/home.js`)
- [x] Frontend: đăng nhập / đăng ký (`login.html`, `register.html`): `FormHandler` (`components/form.js`) + `utils/validators.js` (cùng quy tắc với server), `?redirect=` chỉ nhận đường dẫn nội bộ (`getRedirectTarget`), trang cần đăng nhập thì chuyển tới `loginUrl()`
- [x] Frontend: chi tiết tin `product.html?id=` (`js/pages/product.js`, `components/gallery.js` + `<dialog>` phóng to, giỏ hàng / mua ngay / yêu thích / chia sẻ, lưu `recentlyViewed`, tin cùng danh mục)
- [ ] Frontend: đăng tin, giỏ hàng, yêu thích, đơn hàng
- [ ] Frontend admin
- [ ] README hoàn chỉnh + ảnh chụp màn hình cho báo cáo

## Cách làm việc

- Làm **từng feature một**, xong thì kiểm tra bằng `curl` hoặc trình duyệt rồi cập nhật mục Tiến độ ở file này.
- Sửa schema thì cập nhật luôn `seed.js`, README và mục CSDL ở trên.
- Không chạy `db:reset` hay xóa dữ liệu khi chưa hỏi.
- Không thêm thư viện mới khi chưa hỏi (đặc biệt phía frontend).
