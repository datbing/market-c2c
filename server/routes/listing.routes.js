import { Router } from 'express';
import {
  listListings,
  getListing,
  createListing,
  updateListing,
  updateListingStatus,
  deleteListing,
} from '../controllers/listing.controller.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', listListings);
// Body là FormData (có ảnh) -> controller tự đọc bằng utils/multipart.js
router.post('/', requireAuth, createListing);
// optionalAuth: khách vẫn xem được, nhưng nếu là chủ tin/admin thì thấy thêm tin chưa duyệt
router.get('/:id', optionalAuth, getListing);

// Chủ tin quản lý tin của mình
router.put('/:id', requireAuth, updateListing);
router.patch('/:id/status', requireAuth, updateListingStatus);
router.delete('/:id', requireAuth, deleteListing);

export default router;
