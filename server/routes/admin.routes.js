/**
 * Admin API: /api/admin/...  (login + admin role required)
 */
import { Router } from 'express';
import * as Admin from '../controllers/admin.controller.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/stats', Admin.getStats);

router.get('/listings', Admin.listListings);
router.patch('/listings/:id/review', Admin.reviewListing);

router.get('/users', Admin.listUsers);
router.patch('/users/:id/status', Admin.updateUserStatus);

router.get('/categories', Admin.listCategories);
router.post('/categories', Admin.createCategory);
router.put('/categories/:id', Admin.updateCategory);
router.delete('/categories/:id', Admin.deleteCategory);

router.get('/reports', Admin.listReports);
router.patch('/reports/:id', Admin.handleReport);

export default router;
