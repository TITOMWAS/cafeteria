const path = require('path');
const fs = require('fs');
const multer = require('multer');
const pool = require('../config/database');
const { logAudit } = require('../utils/auditLogger');

// ==========================================
// Meal image uploads (admin) - stored locally
// in backend/uploads and served at /uploads/*
// ==========================================
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `meal_${Date.now()}_${Math.floor(Math.random() * 10000)}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      return cb(new Error('Only JPG, PNG, WEBP or GIF images are allowed'));
    }
    cb(null, true);
  },
});

// POST /api/meals/upload - single-image upload, returns the public URL
const uploadMealImage = [
  upload.single('image'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No image file provided (field name: "image")' });
      }
      const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
      const url = `${base}/uploads/${req.file.filename}`;
      res.json({ success: true, data: { url } });
    } catch (error) {
      console.error('uploadMealImage error:', error);
      res.status(500).json({ success: false, message: 'Server error uploading image' });
    }
  },
];

// GET all meals, optionally filtered by category. Includes average rating.
const getMeals = async (req, res) => {
  try {
    const { category } = req.query;
    const ratingCols = `(SELECT ROUND(AVG(r.rating)::numeric, 1)::float FROM meal_ratings r WHERE r.meal_id = m.id) AS avg_rating,
       (SELECT COUNT(r.id)::int FROM meal_ratings r WHERE r.meal_id = m.id) AS rating_count`;
    let query = `SELECT m.*, ${ratingCols} FROM meals m WHERE m.availability = true ORDER BY m.category, m.name`;
    let params = [];

    if (category) {
      query = `SELECT m.*, ${ratingCols} FROM meals m WHERE m.category = $1 AND m.availability = true ORDER BY m.name`;
      params = [category.toLowerCase()];
    }

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('getMeals error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching meals' });
  }
};

// GET single meal
const getMealById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM meals WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Meal not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// POST create meal (admin only)
const createMeal = async (req, res) => {
  try {
    const { name, description, price, image_url, category, quantity_available } = req.body;
    if (!name || !price || !category) {
      return res.status(400).json({ success: false, message: 'Name, price, and category are required' });
    }
    const result = await pool.query(
      `INSERT INTO meals (name, description, price, image_url, category, quantity_available, availability)
       VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING *`,
      [name, description, price, image_url || '', category.toLowerCase(), quantity_available || 0]
    );
    logAudit(req, 'meal.create', 'meal', result.rows[0].id, { name, price });
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('createMeal error:', error);
    res.status(500).json({ success: false, message: 'Server error creating meal' });
  }
};

// PUT update meal (admin only)
const updateMeal = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, image_url, category, quantity_available, availability } = req.body;
    const result = await pool.query(
      `UPDATE meals SET
         name = COALESCE($1, name), description = COALESCE($2, description),
         price = COALESCE($3, price), image_url = COALESCE($4, image_url),
         category = COALESCE($5, category), quantity_available = COALESCE($6, quantity_available),
         availability = COALESCE($7, availability)
       WHERE id=$8 RETURNING *`,
      [name ?? null, description ?? null, price ?? null, image_url ?? null,
       category?.toLowerCase() ?? null, quantity_available ?? null, availability ?? null, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Meal not found' });
    }
    logAudit(req, 'meal.update', 'meal', id, { name, price, availability });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('updateMeal error:', error);
    res.status(500).json({ success: false, message: 'Server error updating meal' });
  }
};

// DELETE (disable) a meal
const deleteMeal = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE meals SET availability = false WHERE id = $1', [id]);
    logAudit(req, 'meal.disable', 'meal', id, null);
    res.json({ success: true, message: 'Meal disabled successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ==========================================
// Ratings - students rate served meals (1-5)
// ==========================================

// POST /api/meals/:id/rating { rating }
const rateMeal = async (req, res) => {
  try {
    const { id } = req.params;
    const rating = parseInt(req.body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
    }
    // Only students who have been served this meal can rate it
    const served = await pool.query(
      `SELECT 1 FROM orders o JOIN order_items oi ON oi.order_id = o.id
       WHERE o.user_id = $1 AND oi.meal_id = $2 AND o.status = 'served' LIMIT 1`,
      [req.user.id, id]
    );
    if (served.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'You can only rate meals you have collected' });
    }
    const result = await pool.query(
      `INSERT INTO meal_ratings (meal_id, user_id, rating) VALUES ($1, $2, $3)
       ON CONFLICT (meal_id, user_id) DO UPDATE SET rating = EXCLUDED.rating, created_at = NOW()
       RETURNING meal_id, user_id, rating`,
      [id, req.user.id, rating]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('rateMeal error:', error);
    res.status(500).json({ success: false, message: 'Server error saving rating' });
  }
};

// GET /api/meals/my-ratings - ratings the current user has given
const getMyRatings = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT meal_id, rating FROM meal_ratings WHERE user_id = $1',
      [req.user.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error fetching ratings' });
  }
};

module.exports = { upload, uploadMealImage, getMeals, getMealById, createMeal, updateMeal, deleteMeal, rateMeal, getMyRatings };
