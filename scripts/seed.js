/**
 * Thêm dữ liệu mẫu: tài khoản admin, người dùng, danh mục, tin đăng, đơn hàng, báo cáo.
 *   npm run db:seed
 * Chỉ chạy khi bảng users đang trống (tránh nhân đôi dữ liệu).
 * Muốn làm lại từ đầu: npm run db:reset
 */
import bcrypt from 'bcryptjs';
import { pool, withTransaction } from '../server/config/db.js';
import { toSearchText, slugify } from '../server/utils/text.js';

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

const USERS = [
  { key: 'admin', name: 'Quản trị viên', email: 'admin@marketc2c.vn', password: 'Admin@123', role: 'admin', phone: '0900000000', province: 'TP. Hồ Chí Minh' },
  { key: 'an', name: 'Nguyễn Văn An', email: 'an@example.com', password: '123456', role: 'user', phone: '0901234567', province: 'TP. Hồ Chí Minh' },
  { key: 'binh', name: 'Trần Thị Bình', email: 'binh@example.com', password: '123456', role: 'user', phone: '0912345678', province: 'Hà Nội' },
];

// category = vị trí trong mảng CATEGORIES, seller = key trong USERS
const LISTINGS = [
  { key: 'iphone', seller: 'an', category: 0, title: 'iPhone 13 128GB xanh dương, pin 89%', description: 'Máy chính hãng VN/A, dùng kỹ, không trầy xước. Tặng kèm ốp lưng và cáp sạc. Bao test 7 ngày.', price: 9500000, condition: 'like_new', province: 'TP. Hồ Chí Minh', status: 'active' },
  { key: 'dell', seller: 'binh', category: 1, title: 'Laptop Dell Latitude 7490 i5 8GB 256GB SSD', description: 'Máy văn phòng bền bỉ, màn 14 inch Full HD, pin còn khoảng 3 tiếng. Phù hợp sinh viên.', price: 5200000, condition: 'used', province: 'Hà Nội', status: 'active' },
  { key: 'jacket', seller: 'binh', category: 2, title: 'Áo khoác dù nam size L chống nước', description: 'Mua về mặc 2 lần, hơi rộng nên pass lại. Màu đen, có mũ tháo rời.', price: 180000, condition: 'like_new', province: 'TP. Hồ Chí Minh', status: 'active' },
  { key: 'airfryer', seller: 'an', category: 3, title: 'Nồi chiên không dầu Philips 4.1L', description: 'Dùng được 1 năm, hoạt động tốt, đã vệ sinh sạch sẽ. Chuyển nhà nên thanh lý.', price: 750000, condition: 'used', province: 'Đà Nẵng', status: 'sold' },
  { key: 'bike', seller: 'an', category: 4, title: 'Xe đạp thể thao Giant ATX 27.5', description: 'Khung nhôm, 21 tốc độ, phanh đĩa cơ. Đã thay lốp mới tháng trước.', price: 2800000, condition: 'used', province: 'TP. Hồ Chí Minh', status: 'active' },
  { key: 'books', seller: 'binh', category: 5, title: 'Combo 3 cuốn sách lập trình JavaScript', description: 'Gồm Eloquent JavaScript, You Don\'t Know JS và Clean Code. Sách còn mới khoảng 90%.', price: 250000, condition: 'used', province: 'Hà Nội', status: 'pending' },
  { key: 'stroller', seller: 'binh', category: 7, title: 'Xe đẩy em bé Joie gấp gọn', description: 'Bé lớn không dùng nữa, xe còn đẹp, đầy đủ mái che và giỏ để đồ.', price: 1100000, condition: 'like_new', province: 'TP. Hồ Chí Minh', status: 'active' },
  { key: 'ipad', seller: 'an', category: 0, title: 'iPad Gen 9 64GB WiFi xám', description: 'Máy zin, pin 92%, có dán cường lực. Tặng kèm bao da.', price: 4300000, condition: 'like_new', province: 'Hà Nội', status: 'active' },
  { key: 'tent', seller: 'binh', category: 6, title: 'Lều cắm trại 4 người chống mưa', description: 'Hàng mới chưa sử dụng, mua dư nên bán lại. Dựng nhanh trong 5 phút.', price: 650000, condition: 'new', province: 'Đà Nẵng', status: 'active' },
];

async function seed() {
  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM users');
  if (total > 0) {
    console.log('ℹ Database đã có dữ liệu, bỏ qua seed. Dùng "npm run db:reset" để làm lại từ đầu.');
    return;
  }

  await withTransaction(async (conn) => {
    // 1. Danh mục
    const categoryIds = [];
    for (const [index, cat] of CATEGORIES.entries()) {
      const [result] = await conn.query(
        'INSERT INTO categories (name, slug, icon, sort_order) VALUES (?, ?, ?, ?)',
        [cat.name, slugify(cat.name), cat.icon, index + 1],
      );
      categoryIds.push(result.insertId);
    }

    // 2. Người dùng (mật khẩu được băm bằng bcrypt)
    const userIds = {};
    for (const user of USERS) {
      const passwordHash = await bcrypt.hash(user.password, 10);
      const [result] = await conn.query(
        `INSERT INTO users (name, email, phone, password_hash, province, role)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [user.name, user.email, user.phone, passwordHash, user.province, user.role],
      );
      userIds[user.key] = result.insertId;
    }

    // 3. Tin đăng
    const listingIds = {};
    for (const item of LISTINGS) {
      const [result] = await conn.query(
        `INSERT INTO listings
           (user_id, category_id, title, description, price, item_condition,
            province, status, search_text, sold_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userIds[item.seller],
          categoryIds[item.category],
          item.title,
          item.description,
          item.price,
          item.condition,
          item.province,
          item.status,
          toSearchText(item.title, item.description),
          item.status === 'sold' ? new Date() : null,
        ],
      );
      listingIds[item.key] = result.insertId;
    }

    // 4. Một đơn hàng đã hoàn thành (Bình mua nồi chiên của An)
    const airfryer = LISTINGS.find((l) => l.key === 'airfryer');
    await conn.query(
      `INSERT INTO orders
         (listing_id, buyer_id, seller_id, listing_title, price,
          receiver_name, receiver_phone, address, province, status, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', NOW())`,
      [
        listingIds.airfryer, userIds.binh, userIds.an, airfryer.title, airfryer.price,
        'Trần Thị Bình', '0912345678', '12 Nguyễn Văn Linh, Hải Châu', 'Đà Nẵng',
      ],
    );

    // 5. Một báo cáo vi phạm đang chờ admin xử lý
    await conn.query(
      'INSERT INTO reports (listing_id, reporter_id, reason) VALUES (?, ?, ?)',
      [listingIds.jacket, userIds.an, 'Ảnh không đúng với sản phẩm thực tế'],
    );
  });

  console.log('✔ Đã thêm dữ liệu mẫu:');
  console.log(`   - ${CATEGORIES.length} danh mục, ${USERS.length} tài khoản, ${LISTINGS.length} tin đăng`);
  console.log('   - Tài khoản đăng nhập:');
  USERS.forEach((u) => console.log(`       ${u.role.padEnd(5)} | ${u.email} / ${u.password}`));
}

try {
  await seed();
} catch (err) {
  console.error(`✖ Lỗi khi seed: ${err.message}`);
  console.error('  → Đã chạy "npm run db:setup" chưa?');
  process.exitCode = 1;
} finally {
  await pool.end();
}
