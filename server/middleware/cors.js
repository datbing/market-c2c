/**
 * CORS: cho phép frontend (khác origin, vd http://market-c2c.test) gọi API
 * tại http://market-c2c.test:3000 và gửi kèm cookie session.
 *
 * Tự viết thay vì dùng thư viện `cors` để thấy rõ cơ chế:
 *  - Chỉ origin trong whitelist mới được trả header Access-Control-Allow-Origin
 *  - Có gửi cookie (credentials) thì KHÔNG được dùng "*", phải ghi đúng origin
 *  - Request "preflight" (OPTIONS) được trả 204 luôn, không vào router
 */
import { config } from '../config/env.js';

const allowedOrigins = new Set(config.corsOrigins);

export function cors(req, res, next) {
  const { origin } = req.headers;

  // Response thay đổi theo Origin -> báo cho cache/proxy biết
  res.vary('Origin');

  if (origin && allowedOrigins.has(origin)) {
    res.set({
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
    });
  }

  if (req.method === 'OPTIONS') {
    res.set({
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept',
      'Access-Control-Max-Age': '600', // trình duyệt nhớ kết quả preflight 10 phút
    });
    return res.sendStatus(204);
  }

  next();
}
