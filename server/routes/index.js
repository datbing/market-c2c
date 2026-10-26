/**
 * Router gốc của API, gắn tại /api.
 * Mỗi module (auth, categories, listings, orders, admin...) có file route riêng.
 */
import { Router } from 'express';
import { checkConnection } from '../config/db.js';
import authRoutes from './auth.routes.js';
import categoryRoutes from './category.routes.js';
import listingRoutes from './listing.routes.js';

const router = Router();

/** GET /api/health - kiểm tra server và DB còn sống */
router.get('/health', async (req, res) => {
  await checkConnection();
  res.json({
    success: true,
    data: { status: 'ok', database: 'connected', time: new Date().toISOString() },
  });
});

router.use('/auth', authRoutes);
router.use('/categories', categoryRoutes);
router.use('/listings', listingRoutes);

// Các module tiếp theo sẽ gắn ở đây:
// router.use('/orders', orderRoutes);
// router.use('/admin', adminRoutes);

export default router;
