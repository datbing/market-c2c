import { Router } from 'express';
import { listListings } from '../controllers/listing.controller.js';

const router = Router();

router.get('/', listListings);

export default router;
