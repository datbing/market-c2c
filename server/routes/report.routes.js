import { Router } from 'express';
import { createReport } from '../controllers/report.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/', requireAuth, createReport);

export default router;
