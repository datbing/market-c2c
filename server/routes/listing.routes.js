import { Router } from 'express';
import { listListings, getListing } from '../controllers/listing.controller.js';
import { optionalAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', listListings);
// optionalAuth: khách vẫn xem được, nhưng nếu là chủ tin/admin thì thấy thêm tin chưa duyệt
router.get('/:id', optionalAuth, getListing);

export default router;
