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

// Mọi thao tác với đơn hàng đều cần đăng nhập
router.use(requireAuth);

router.post('/', createOrders);
router.get('/', listOrders);
// Đặt trước '/:id' để "summary" không bị hiểu là id đơn
router.get('/summary', orderSummary);
router.get('/:id', getOrder);
router.patch('/:id/status', updateOrderStatus);

export default router;
