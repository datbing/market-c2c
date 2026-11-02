/**
 * Data of the logged in user: /api/me/...
 */
import { Router } from 'express';
import { listMyListings } from '../controllers/listing.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Every route in this file requires login
router.use(requireAuth);

router.get('/listings', listMyListings);

export default router;
