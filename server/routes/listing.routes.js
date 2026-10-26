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
// The body is FormData (with images) -> the controller reads it with utils/multipart.js
router.post('/', requireAuth, createListing);
// optionalAuth: guests can view, but owners/admins also see unapproved listings
router.get('/:id', optionalAuth, getListing);

// Owners manage their own listings
router.put('/:id', requireAuth, updateListing);
router.patch('/:id/status', requireAuth, updateListingStatus);
router.delete('/:id', requireAuth, deleteListing);

export default router;
