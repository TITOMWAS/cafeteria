const pool = require('../config/database');

// GET /api/favourites - current user's favourite meals
const getFavourites = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT m.* FROM favourites f JOIN meals m ON m.id = f.meal_id
       WHERE f.user_id = $1 AND m.availability = true ORDER BY f.created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('getFavourites error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching favourites' });
  }
};

// POST /api/favourites/:mealId - add a favourite
const addFavourite = async (req, res) => {
  try {
    const { mealId } = req.params;
    const meal = await pool.query('SELECT id FROM meals WHERE id = $1 AND availability = true', [mealId]);
    if (meal.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Meal not found' });
    }
    await pool.query(
      'INSERT INTO favourites (user_id, meal_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.user.id, mealId]
    );
    res.json({ success: true, message: 'Added to favourites' });
  } catch (error) {
    console.error('addFavourite error:', error);
    res.status(500).json({ success: false, message: 'Server error adding favourite' });
  }
};

// DELETE /api/favourites/:mealId - remove a favourite
const removeFavourite = async (req, res) => {
  try {
    const { mealId } = req.params;
    await pool.query('DELETE FROM favourites WHERE user_id = $1 AND meal_id = $2', [req.user.id, mealId]);
    res.json({ success: true, message: 'Removed from favourites' });
  } catch (error) {
    console.error('removeFavourite error:', error);
    res.status(500).json({ success: false, message: 'Server error removing favourite' });
  }
};

module.exports = { getFavourites, addFavourite, removeFavourite };
