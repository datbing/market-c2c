/**
 * Insert sample data: accounts, categories, listings with real photos, orders, reports.
 *   npm run db:seed
 * Only runs while the users table is empty (avoids duplicating data).
 * To start over: npm run db:reset
 *
 * Sample images live in database/seed-images/ (from Unsplash, see CREDITS.md)
 * and are copied into uploads/listings/ with random names, exactly like user uploads.
 * Listing / order dates are spread over the last ~2 weeks so the admin charts have data.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool, withTransaction } from '../server/config/db.js';
import { toSearchText, slugify } from '../server/utils/text.js';
import { detectImageType, saveListingImages, removeImages } from '../server/utils/image-store.js';

const SEED_IMAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../database/seed-images');

/** The moment `days` days ago at `hour` o'clock (server time) */
function daysAgo(days, hour = 10, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, minute, 0, 0);
  // Never return a time in the future (e.g. seeding at 8 AM with hour = 10)
  return date > new Date() ? new Date(Date.now() - 60_000) : date;
}

const CATEGORIES = [
  { name: 'Điện thoại & Máy tính bảng', icon: 'bi-phone' },
  { name: 'Laptop & Máy tính', icon: 'bi-laptop' },
  { name: 'Thời trang', icon: 'bi-bag' },
  { name: 'Đồ gia dụng', icon: 'bi-house-door' },
  { name: 'Xe cộ', icon: 'bi-bicycle' },
  { name: 'Sách & Văn phòng phẩm', icon: 'bi-book' },
  { name: 'Thể thao & Dã ngoại', icon: 'bi-trophy' },
  { name: 'Mẹ & Bé', icon: 'bi-balloon-heart' },
];

// joined = days since signing up; huy is locked (huy's listings do not show on the home page)
const USERS = [
  { key: 'admin', name: 'Quản trị viên', email: 'admin@marketc2c.vn', password: 'Admin@123', role: 'admin', phone: '0900000000', province: 'TP. Hồ Chí Minh', joined: 60 },
  { key: 'an', name: 'Nguyễn Văn An', email: 'an@example.com', password: '123456', phone: '0901234567', province: 'TP. Hồ Chí Minh', joined: 45 },
  { key: 'binh', name: 'Trần Thị Bình', email: 'binh@example.com', password: '123456', phone: '0912345678', province: 'Hà Nội', joined: 40 },
  { key: 'cuong', name: 'Lê Minh Cường', email: 'cuong@example.com', password: '123456', phone: '0935123456', province: 'Đà Nẵng', joined: 12 },
  { key: 'dung', name: 'Phạm Thu Dung', email: 'dung@example.com', password: '123456', phone: '0987654321', province: 'Cần Thơ', joined: 6 },
  { key: 'huy', name: 'Hoàng Gia Huy', email: 'huy@example.com', password: '123456', phone: '0978111222', province: 'Hải Phòng', joined: 20, status: 'locked' },
];

const HCM = 'TP. Hồ Chí Minh';
const HN = 'Hà Nội';
const DN = 'Đà Nẵng';
const CT = 'Cần Thơ';

// category = index in CATEGORIES, seller = key in USERS, images = file names in seed-images (without extension)
// days = posted this many days ago
const LISTINGS = [
  // --- Phones & tablets
  { key: 'iphone13pro', seller: 'an', category: 0, title: 'iPhone 13 Pro 256GB xanh Sierra, pin 91%', price: 14900000, condition: 'like_new', province: HCM, status: 'active', days: 3, views: 186,
    images: ['iphone13pro-1', 'iphone13pro-2', 'iphone13pro-3'],
    description: 'Máy chính hãng VN/A, mua tại Thế Giới Di Động, còn hóa đơn. Không trầy xước, Face ID và camera hoạt động hoàn hảo. Tặng kèm ốp lưng MagSafe và cáp sạc. Bao test 7 ngày, có thể xem máy trực tiếp ở Quận 3.' },
  { key: 'iphone13', seller: 'cuong', category: 0, title: 'iPhone 13 128GB xanh dương, máy zin chưa sửa', price: 9500000, condition: 'used', province: DN, status: 'active', days: 2, views: 74,
    images: ['iphone13-1', 'iphone13-2', 'iphone13-3'],
    description: 'Máy dùng 2 năm, có vài vết xước nhẹ ở viền, màn hình đẹp không ám. Pin 86%. Lên đời nên bán lại, ưu tiên giao dịch trực tiếp tại Hải Châu.' },
  { key: 'ipad', seller: 'an', category: 0, title: 'iPad Air 4 64GB WiFi xám, kèm bao da', price: 7200000, condition: 'like_new', province: HCM, status: 'active', days: 6, views: 95,
    images: ['ipad-1', 'ipad-2'],
    description: 'Máy chủ yếu dùng đọc tài liệu và xem phim, pin 93%, luôn dán cường lực. Tặng kèm bao da gập và bút cảm ứng không thương hiệu.' },
  { key: 'galaxy', seller: 'dung', category: 0, title: 'Samsung Galaxy S21 Ultra 5G 256GB đen, fullbox', price: 8300000, condition: 'like_new', province: CT, status: 'active', days: 1, views: 41,
    images: ['galaxy-1', 'galaxy-2', 'galaxy-3'],
    description: 'Đầy đủ hộp, sạc, sách hướng dẫn. Màn hình không ám, không burn-in, camera zoom 100x chụp rất nét. Máy chưa qua sửa chữa.' },
  { key: 'airpods', seller: 'binh', category: 0, title: 'Tai nghe AirPods Pro chính hãng, sạc không dây', price: 2900000, condition: 'used', province: HN, status: 'sold', days: 10, views: 132,
    images: ['airpods-1', 'airpods-2'],
    description: 'Chống ồn tốt, pin nghe khoảng 4 tiếng. Hộp sạc có vài vết xước nhỏ. Đã vệ sinh sạch, thay núm tai mới.' },

  // --- Laptops & computers
  { key: 'xps', seller: 'binh', category: 1, title: 'Dell XPS 13 9310 i7 16GB 512GB, màn 4K cảm ứng', price: 17500000, condition: 'like_new', province: HN, status: 'active', days: 4, views: 158,
    images: ['xps-1', 'xps-2', 'xps-3'],
    description: 'Core i7 thế hệ 11, RAM 16GB, SSD 512GB, màn 13.4 inch 4K cảm ứng. Vỏ nhôm còn đẹp như mới, pin khoảng 7 tiếng làm văn phòng. Còn bảo hành Dell đến tháng 3 năm sau.' },
  { key: 'latitude', seller: 'cuong', category: 1, title: 'Laptop Dell Latitude 7490 i5 8GB 256GB SSD', price: 5200000, condition: 'used', province: DN, status: 'hidden', days: 13, views: 63,
    images: ['latitude-1', 'latitude-2'],
    description: 'Máy văn phòng bền bỉ, màn 14 inch Full HD, pin còn khoảng 3 tiếng. Phù hợp sinh viên học online, làm Word, Excel.' },
  { key: 'macbook', seller: 'an', category: 1, title: 'MacBook Air M1 2020 8GB 256GB bạc', price: 13800000, condition: 'like_new', province: HCM, status: 'active', days: 8, views: 241,
    images: ['macbook-1', 'macbook-2', 'macbook-3'],
    description: 'Sạc 87 lần, pin 96%. Máy chạy mát, không quạt nên hoàn toàn yên tĩnh. Tặng kèm túi chống sốc và miếng dán bàn phím.' },
  { key: 'keyboard', seller: 'dung', category: 1, title: 'Bàn phím cơ Keychron K2 switch đỏ, kết nối Bluetooth', price: 1350000, condition: 'like_new', province: CT, status: 'sold', days: 9, views: 88,
    images: ['keyboard-1', 'keyboard-2', 'keyboard-3'],
    description: 'Layout 75%, dùng được cả Mac và Windows, kết nối 3 thiết bị Bluetooth. Switch đỏ gõ nhẹ, êm. Có đèn nền trắng.' },
  { key: 'monitor', seller: 'binh', category: 1, title: 'Màn hình LG 27 inch 2K IPS 75Hz', price: 3600000, condition: 'used', province: HN, status: 'active', days: 5, views: 57,
    images: ['monitor-1', 'monitor-2'],
    description: 'Độ phân giải 2560x1440, tấm nền IPS màu đẹp, phù hợp làm đồ họa nhẹ và lập trình. Không điểm chết, kèm chân đế và cáp HDMI.' },

  // --- Fashion
  { key: 'leather-jacket', seller: 'cuong', category: 2, title: 'Áo khoác da nam size L, da cừu thật', price: 1200000, condition: 'like_new', province: DN, status: 'active', days: 3, views: 112,
    images: ['leather-jacket-1', 'leather-jacket-2', 'leather-jacket-3'],
    description: 'Da cừu mềm, lót trong bằng vải dù. Mua ở Hội An, mặc 3 lần vì đổi size. Vai 46cm, dài áo 68cm.' },
  { key: 'puffer', seller: 'binh', category: 2, title: 'Áo phao nam size L chống nước, nhẹ', price: 380000, condition: 'like_new', province: HN, status: 'pending', days: 0, views: 0,
    images: ['puffer-1'],
    description: 'Áo phao siêu nhẹ, gấp gọn bỏ túi được. Màu đen, mặc 1 mùa đông, đã giặt sạch.' },
  { key: 'sneakers', seller: 'dung', category: 2, title: 'Giày Nike Air Force 1 trắng size 42', price: 1450000, condition: 'used', province: CT, status: 'active', days: 2, views: 69,
    images: ['sneakers-1', 'sneakers-2', 'sneakers-3'],
    description: 'Hàng chính hãng mua tại store, đi khoảng 10 lần, đế còn rất mới. Kèm hộp và dây giày dự phòng.' },
  { key: 'satchel', seller: 'binh', category: 2, title: 'Túi xách nữ da xám', price: 450000, condition: 'new', province: HN, status: 'rejected', days: 7, views: 0,
    rejectReason: 'Mô tả quá ngắn, thiếu kích thước và chất liệu túi',
    images: ['satchel-1'],
    description: 'Túi mới, chưa dùng.' },
  { key: 'messenger', seller: 'an', category: 2, title: 'Túi da bò đeo chéo phong cách vintage', price: 690000, condition: 'used', province: HCM, status: 'active', days: 11, views: 46,
    images: ['messenger-1'],
    description: 'Da bò thật, càng dùng càng lên màu đẹp. Ngăn chính vừa iPad 11 inch, có 2 túi trước. Khóa đồng chắc chắn.' },

  // --- Home appliances
  { key: 'airfryer', seller: 'an', category: 3, title: 'Nồi chiên không dầu Philips 4.1L', price: 750000, condition: 'used', province: DN, status: 'sold', days: 12, views: 97,
    images: ['airfryer-1', 'airfryer-2'],
    description: 'Dùng được 1 năm, hoạt động tốt, đã vệ sinh sạch sẽ. Chuyển nhà nên thanh lý.' },
  { key: 'espresso', seller: 'cuong', category: 3, title: 'Máy pha cà phê espresso, kèm tay cầm và ca đánh sữa', price: 3200000, condition: 'used', province: DN, status: 'active', days: 5, views: 83,
    images: ['espresso-1', 'espresso-2'],
    description: 'Áp suất 15 bar, có vòi đánh sữa làm cappuccino. Máy đã vệ sinh cặn định kỳ, chạy ổn định. Phù hợp quán nhỏ hoặc dùng tại nhà.' },
  { key: 'lamp', seller: 'dung', category: 3, title: 'Đèn bàn học chống cận, đế kim loại', price: 220000, condition: 'like_new', province: CT, status: 'active', days: 1, views: 18,
    images: ['lamp-1'],
    description: 'Đèn LED ánh sáng vàng ấm, cần đèn xoay linh hoạt. Mua về dùng 2 tháng, còn như mới.' },

  // --- Vehicles
  { key: 'bike', seller: 'an', category: 4, title: 'Xe đạp địa hình Giant ATX 27.5, 21 tốc độ', price: 2800000, condition: 'used', province: HCM, status: 'active', days: 9, views: 120,
    images: ['bike-1', 'bike-2'],
    description: 'Khung nhôm, 21 tốc độ, phanh đĩa cơ. Đã thay lốp mới tháng trước, sên líp được bảo dưỡng định kỳ.' },
  { key: 'vespa', seller: 'binh', category: 4, title: 'Vespa Sprint 125 xanh ngọc 2019, chính chủ', price: 52000000, condition: 'used', province: HN, status: 'active', days: 6, views: 305,
    images: ['vespa-1'],
    description: 'Xe chính chủ, biển Hà Nội, đi 18.000km. Bảo dưỡng định kỳ tại hãng, máy êm, sơn zin. Giấy tờ đầy đủ, sang tên nhanh.' },
  { key: 'primavera', seller: 'huy', category: 4, title: 'Vespa Primavera trắng 2021', price: 48000000, condition: 'like_new', province: 'Hải Phòng', status: 'active', days: 15, views: 22,
    images: ['primavera-1', 'primavera-2'],
    description: 'Xe đi ít, còn rất mới. Liên hệ xem xe trực tiếp.' },
  { key: 'helmet', seller: 'cuong', category: 4, title: 'Mũ bảo hiểm fullface size M, kính khói', price: 1900000, condition: 'like_new', province: DN, status: 'active', days: 4, views: 39,
    images: ['helmet-1', 'helmet-2'],
    description: 'Mũ fullface đạt chuẩn ECE, lót tháo giặt được, kính khói chống tia UV. Đội vài lần, không va chạm.' },

  // --- Books & stationery
  { key: 'jsbooks', seller: 'binh', category: 5, title: 'Combo sách lập trình JavaScript cho người mới', price: 250000, condition: 'used', province: HN, status: 'pending', days: 1, views: 0,
    images: ['jsbooks-1', 'jsbooks-2'],
    description: 'Gồm Eloquent JavaScript, You Don\'t Know JS và Clean Code. Sách còn mới khoảng 90%, có vài trang gạch chân bút chì.' },
  { key: 'novels', seller: 'dung', category: 5, title: 'Thanh lý 12 cuốn tiểu thuyết văn học', price: 300000, condition: 'used', province: CT, status: 'sold', days: 7, views: 52,
    images: ['novels-1', 'novels-2'],
    description: 'Gồm Nhà giả kim, Rừng Na Uy, Không gia đình và nhiều cuốn khác. Sách giữ cẩn thận, không ố vàng.' },

  // --- Sports & outdoors
  { key: 'tent', seller: 'binh', category: 6, title: 'Lều cắm trại 4 người chống mưa', price: 650000, condition: 'new', province: DN, status: 'active', days: 10, views: 66,
    images: ['tent-1', 'tent-2', 'tent-3'],
    description: 'Hàng mới chưa sử dụng, mua dư nên bán lại. Dựng nhanh trong 5 phút, 2 lớp chống mưa, có túi đựng.' },
  { key: 'racket', seller: 'an', category: 6, title: 'Vợt tennis Wilson Clash 100 v2', price: 2400000, condition: 'like_new', province: HCM, status: 'active', days: 3, views: 48,
    images: ['racket-1', 'racket-2', 'racket-3'],
    description: 'Nặng 295g, cán size 2, đã căng dây mới 24 lbs. Đánh khoảng 1 tháng, khung không nứt mẻ.' },
  { key: 'dumbbell', seller: 'cuong', category: 6, title: 'Cặp tạ tay 5kg bọc cao su', price: 280000, condition: 'used', province: DN, status: 'active', days: 2, views: 27,
    images: ['dumbbell-1', 'dumbbell-2'],
    description: 'Tạ lục giác bọc cao su, không lăn, không làm trầy sàn. Bán cả cặp 2 quả 5kg.' },

  // --- Mother & baby
  { key: 'stroller', seller: 'binh', category: 7, title: 'Xe đẩy em bé gấp gọn, có mái che', price: 1100000, condition: 'like_new', province: HCM, status: 'active', days: 8, views: 71,
    images: ['stroller-1', 'stroller-2'],
    description: 'Bé lớn không dùng nữa, xe còn đẹp, đầy đủ mái che và giỏ để đồ. Gấp gọn một tay, bỏ vừa cốp xe hơi.' },
  { key: 'toys', seller: 'dung', category: 7, title: 'Bộ đồ chơi gỗ Montessori cho bé 1–3 tuổi', price: 350000, condition: 'new', province: CT, status: 'pending', days: 0, views: 0,
    images: ['toys-1', 'toys-2'],
    description: 'Gồm cầu vồng xếp chồng và bàn tính gỗ, sơn an toàn cho bé. Hàng mới, còn nguyên hộp.' },
];

// Orders: created/completed = days ago. Every sold listing must have exactly one completed order.
const ORDERS = [
  { listing: 'airfryer', buyer: 'binh', status: 'completed', created: 11, completed: 8, address: '12 Nguyễn Văn Linh, Hải Châu', province: DN },
  { listing: 'airpods', buyer: 'an', status: 'completed', created: 9, completed: 6, address: '45 Võ Văn Tần, Quận 3', province: HCM },
  { listing: 'keyboard', buyer: 'binh', status: 'completed', created: 8, completed: 5, address: '18 Trần Đại Nghĩa, Hai Bà Trưng', province: HN, note: 'Giao giờ hành chính giúp mình' },
  { listing: 'novels', buyer: 'cuong', status: 'completed', created: 6, completed: 3, address: '201 Lê Duẩn, Thanh Khê', province: DN },
  { listing: 'stroller', buyer: 'dung', status: 'cancelled', created: 5, address: '9 Mậu Thân, Ninh Kiều', province: CT },
  { listing: 'iphone13pro', buyer: 'cuong', status: 'cancelled', created: 4, address: '201 Lê Duẩn, Thanh Khê', province: DN, note: 'Mình đổi ý, xin lỗi bạn' },
  { listing: 'monitor', buyer: 'an', status: 'shipping', created: 3, address: '45 Võ Văn Tần, Quận 3', province: HCM },
  { listing: 'sneakers', buyer: 'cuong', status: 'confirmed', created: 1, address: '201 Lê Duẩn, Thanh Khê', province: DN, note: 'Gói kỹ giúp mình nhé' },
  { listing: 'macbook', buyer: 'binh', status: 'pending', created: 0, address: '18 Trần Đại Nghĩa, Hai Bà Trưng', province: HN, note: 'Cho mình xem máy trước khi nhận được không?' },
];

const REPORTS = [
  { listing: 'leather-jacket', reporter: 'binh', reason: 'Ảnh có vẻ lấy trên mạng, không phải ảnh thật của người bán', created: 1 },
  { listing: 'dumbbell', reporter: 'an', reason: 'Tin đăng trùng lặp, người bán đăng nhiều lần cùng một món', created: 0 },
  { listing: 'vespa', reporter: 'dung', reason: 'Giá rẻ bất thường so với thị trường, nghi ngờ lừa đảo', created: 4, status: 'dismissed', resolved: 3 },
];

/** Read a listing's sample images -> copy them into uploads/listings (UUID names). Returns the relative paths. */
async function copySeedImages(names) {
  const images = await Promise.all(
    names.map(async (name) => {
      const buffer = await fs.readFile(path.join(SEED_IMAGE_DIR, `${name}.webp`));
      const ext = detectImageType(buffer);
      if (!ext) throw new Error(`Ảnh mẫu không hợp lệ: ${name}.webp`);
      return { buffer, ext };
    }),
  );
  return saveListingImages(images);
}

async function seed() {
  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM users');
  if (total > 0) {
    console.log('Database already has data, skipping seed. Use "npm run db:reset" to start over.');
    return;
  }

  // Copy the images first; if writing to the DB fails, delete every copied image (same as the real posting flow)
  const imagePaths = {};
  const allSaved = [];
  try {
    for (const item of LISTINGS) {
      imagePaths[item.key] = await copySeedImages(item.images);
      allSaved.push(...imagePaths[item.key]);
    }

    await withTransaction(async (conn) => {
      // 1. Categories
      const categoryIds = [];
      for (const [index, cat] of CATEGORIES.entries()) {
        const [result] = await conn.query(
          'INSERT INTO categories (name, slug, icon, sort_order) VALUES (?, ?, ?, ?)',
          [cat.name, slugify(cat.name), cat.icon, index + 1],
        );
        categoryIds.push(result.insertId);
      }

      // 2. Users (passwords hashed with bcrypt)
      const users = {};
      for (const user of USERS) {
        const passwordHash = await bcrypt.hash(user.password, 10);
        const [result] = await conn.query(
          `INSERT INTO users (name, email, phone, password_hash, province, role, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [user.name, user.email, user.phone, passwordHash, user.province, user.role ?? 'user',
            user.status ?? 'active', daysAgo(user.joined, 9)],
        );
        users[user.key] = { ...user, id: result.insertId };
      }

      // A listing's sold date = the completion date of its order
      const soldAt = Object.fromEntries(
        ORDERS.filter((o) => o.status === 'completed').map((o) => [o.listing, daysAgo(o.completed, 17)]),
      );

      // 3. Listings + images
      const listings = {};
      for (const [index, item] of LISTINGS.entries()) {
        const createdAt = daysAgo(item.days, 8 + (index % 12), (index * 7) % 60);
        const [result] = await conn.query(
          `INSERT INTO listings
             (user_id, category_id, title, description, price, item_condition, province,
              status, reject_reason, search_text, views, sold_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            users[item.seller].id, categoryIds[item.category], item.title, item.description,
            item.price, item.condition, item.province, item.status, item.rejectReason ?? null,
            toSearchText(item.title, item.description), item.views,
            item.status === 'sold' ? soldAt[item.key] : null, createdAt,
          ],
        );
        listings[item.key] = { ...item, id: result.insertId };

        for (const [order, imagePath] of imagePaths[item.key].entries()) {
          await conn.query(
            'INSERT INTO listing_images (listing_id, path, sort_order) VALUES (?, ?, ?)',
            [result.insertId, imagePath, order],
          );
        }
      }

      // 4. Orders (every status)
      for (const [index, order] of ORDERS.entries()) {
        const listing = listings[order.listing];
        const buyer = users[order.buyer];
        await conn.query(
          `INSERT INTO orders
             (listing_id, buyer_id, seller_id, listing_title, price, receiver_name, receiver_phone,
              address, province, note, status, completed_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            listing.id, buyer.id, users[listing.seller].id, listing.title, listing.price,
            buyer.name, buyer.phone, order.address, order.province, order.note ?? null, order.status,
            order.status === 'completed' ? daysAgo(order.completed, 17) : null,
            daysAgo(order.created, 9 + (index % 10), 15),
          ],
        );
      }

      // 5. Reports
      for (const report of REPORTS) {
        await conn.query(
          `INSERT INTO reports (listing_id, reporter_id, reason, status, resolved_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            listings[report.listing].id, users[report.reporter].id, report.reason,
            report.status ?? 'open', report.resolved != null ? daysAgo(report.resolved, 15) : null,
            daysAgo(report.created, 20),
          ],
        );
      }
    });
  } catch (err) {
    await removeImages(allSaved);
    throw err;
  }

  console.log('Sample data inserted:');
  console.log(`   - ${CATEGORIES.length} categories, ${USERS.length} accounts, ${LISTINGS.length} listings (${allSaved.length} images)`);
  console.log(`   - ${ORDERS.length} orders, ${REPORTS.length} reports`);
  console.log('   - Login accounts:');
  USERS.forEach((u) => {
    const note = u.status === 'locked' ? ' (locked)' : '';
    console.log(`       ${(u.role ?? 'user').padEnd(5)} | ${u.email} / ${u.password}${note}`);
  });
}

try {
  await seed();
} catch (err) {
  console.error(`Seed failed: ${err.message}`);
  console.error('  -> Did you run "npm run db:setup"?');
  process.exitCode = 1;
} finally {
  await pool.end();
}
