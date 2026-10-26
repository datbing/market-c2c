/**
 * Root API router, mounted at /api.
 * Each module (auth, categories, listings, orders, admin...) has its own route file.
 */
import { Router } from 'express';
import { checkConnection } from '../config/db.js';
import authRoutes from './auth.routes.js';
import categoryRoutes from './category.routes.js';
import listingRoutes from './listing.routes.js';
import meRoutes from './me.routes.js';
import orderRoutes from './order.routes.js';
import reportRoutes from './report.routes.js';
import adminRoutes from './admin.routes.js';

const router = Router();

/** GET /api/health - check that the server and the DB are alive */
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
router.use('/me', meRoutes);
router.use('/orders', orderRoutes);
router.use('/reports', reportRoutes);
router.use('/admin', adminRoutes);

export default router;
