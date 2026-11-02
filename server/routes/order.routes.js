import { Router } from 'express';
import {
  createOrders,
  listOrders,
  orderSummary,
  getOrder,
  updateOrderStatus,
} from '../controllers/order.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Every order action requires login
router.use(requireAuth);

router.post('/', createOrders);
router.get('/', listOrders);
// Declared before '/:id' so "summary" is not treated as an order id
router.get('/summary', orderSummary);
router.get('/:id', getOrder);
router.patch('/:id/status', updateOrderStatus);

export default router;
