const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/authMiddleware');
const {
  createNotification,
  getNotifications,
  markRead,
  markAllRead,
  deleteNotification,
} = require('../controllers/notificationController');

// Every logged-in user can read their notifications
router.get('/', protect, getNotifications);
router.patch('/read-all', protect, markAllRead);
router.patch('/:id/read', protect, markRead);

// Admin only: broadcast + moderation
router.post('/', protect, requireRole('admin'), createNotification);
router.delete('/:id', protect, requireRole('admin'), deleteNotification);

module.exports = router;
