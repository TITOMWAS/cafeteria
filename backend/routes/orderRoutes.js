const express = require('express');
const router = express.Router();
const { placeOrder, initiatePayment, getOrders, getMyOrders, updateOrderStatus, getAnalytics, streamOrders, exportOrdersCsv } = require('../controllers/orderController');
const { getMyCarryovers, getAllCarryovers, redeemCarryover } = require('../controllers/carryOverController');
const { protect, optionalAuth, requireRole } = require('../middleware/authMiddleware');

// Public (guests use this too; optionalAuth attributes orders to logged-in students)
router.post('/', optionalAuth, placeOrder);
router.post('/initiate-payment', initiatePayment);

// Student - protected
router.get('/my-orders', protect, getMyOrders);
router.get('/carryovers/mine', protect, getMyCarryovers);

// Staff - live SSE feed + view + update orders
router.get('/stream', protect, requireRole('staff', 'admin'), streamOrders);
router.get('/', protect, requireRole('staff', 'admin'), getOrders);
router.patch('/:id/status', protect, requireRole('staff', 'admin'), updateOrderStatus);

// Carryover redemption (missed meals) - staff/admin
router.get('/carryovers', protect, requireRole('staff', 'admin'), getAllCarryovers);
router.post('/carryovers/:id/redeem', protect, requireRole('staff', 'admin'), redeemCarryover);

// Admin analytics + reports
router.get('/analytics', protect, requireRole('admin'), getAnalytics);
router.get('/export', protect, requireRole('admin'), exportOrdersCsv);

module.exports = router;
