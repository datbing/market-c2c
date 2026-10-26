/**
 * Dữ liệu của chính người đang đăng nhập: /api/me/...
 */
import { Router } from 'express';
import { listMyListings } from '../controllers/listing.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Mọi route trong file này đều cần đăng nhập
router.use(requireAuth);

router.get('/listings', listMyListings);

export default router;
