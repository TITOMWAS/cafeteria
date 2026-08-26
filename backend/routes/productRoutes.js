const express = require('express');
const router = express.Router();
const { getMeals, getMealById, createMeal, updateMeal, deleteMeal, uploadMealImage, rateMeal, getMyRatings } = require('../controllers/productController');
const { protect, requireRole } = require('../middleware/authMiddleware');

// Public
router.get('/', getMeals);
router.get('/my-ratings', protect, getMyRatings);
router.get('/:id', getMealById);

// Admin only
router.post('/', protect, requireRole('admin'), createMeal);
router.post('/upload', protect, requireRole('admin'), ...uploadMealImage);
router.put('/:id', protect, requireRole('admin'), updateMeal);
router.delete('/:id', protect, requireRole('admin'), deleteMeal);

// Ratings (students who collected the meal)
router.post('/:id/rating', protect, rateMeal);

module.exports = router;
