const express = require('express');
const router = express.Router();
const { getFavourites, addFavourite, removeFavourite } = require('../controllers/favouritesController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, getFavourites);
router.post('/:mealId', protect, addFavourite);
router.delete('/:mealId', protect, removeFavourite);

module.exports = router;
