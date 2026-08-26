const express = require('express');
const router = express.Router();
const {
  getProfile,
  updateProfile,
  changePassword,
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
} = require('../controllers/userController');
const { protect, requireRole } = require('../middleware/authMiddleware');

router.get('/profile', protect, getProfile);
router.patch('/profile', protect, updateProfile);
router.patch('/profile/password', protect, changePassword);

// Admin: full user management
router.get('/', protect, requireRole('admin'), getAllUsers);
router.post('/', protect, requireRole('admin'), createUser);
router.patch('/:id', protect, requireRole('admin'), updateUser);
router.delete('/:id', protect, requireRole('admin'), deleteUser);

module.exports = router;
