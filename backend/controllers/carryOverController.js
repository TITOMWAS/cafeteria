const crypto = require('crypto');
const pool = require('../config/database');
const { logAudit } = require('../utils/auditLogger');
const { getSessionForDate } = require('../utils/scheduler');

const shapeRow = (row) => ({
  ...row,
  items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items,
});

// GET /api/orders/carryovers/mine - the signed-in student's redeemable missed meals
const getMyCarryovers = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM meal_carryovers WHERE user_id = $1 AND status IN ('pending', 'redeemed')
       ORDER BY created_at DESC LIMIT 20`,
      [req.user.id]
    );
    res.json({ success: true, data: result.rows.map(shapeRow) });
  } catch (error) {
    console.error('getMyCarryovers error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching your missed meals' });
  }
};

// GET /api/orders/carryovers?search= - staff view of all live carryovers
const getAllCarryovers = async (req, res) => {
  try {
    const { search } = req.query;
    let query = `SELECT c.*, u.name AS student_name, u.student_id
                 FROM meal_carryovers c
                 LEFT JOIN users u ON u.id = c.user_id
                 WHERE c.status = 'pending'`;
    const params = [];
    if (search && String(search).trim()) {
      params.push(`%${String(search).trim().toLowerCase()}%`);
      query += ` AND (
        LOWER(COALESCE(u.name, c.guest_name)) LIKE $1
        OR LOWER(c.phone_number) LIKE $1
        OR LOWER(COALESCE(u.student_id, '')) LIKE $1
        OR LOWER(c.code) LIKE $1
      )`;
    }
    query += ' ORDER BY c.created_at ASC LIMIT 100';
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows.map(shapeRow) });
  } catch (error) {
    console.error('getAllCarryovers error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching carryovers' });
  }
};

// POST /api/orders/carryovers/:id/redeem - cashier hands over the missed meal.
// Only allowed while a serving session is open and before the carryover expires.
const redeemCarryover = async (req, res) => {
  try {
    const { id } = req.params;
    const currentSession = getSessionForDate();
    if (!currentSession) {
      return res.status(400).json({
        success: false,
        message: 'Redemption is only possible during a serving window (breakfast 06-10, lunch 12-15, supper 18-21)',
      });
    }

    const result = await pool.query(
      `UPDATE meal_carryovers SET status = 'redeemed'
       WHERE id = $1 AND status = 'pending' AND expires_at > NOW()
       RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Carryover not found, already redeemed or expired' });
    }

    // Keep the source order's trail consistent for reporting
    await pool.query("UPDATE orders SET status = 'served' WHERE id = $1", [result.rows[0].order_id]);
    logAudit(req, 'carryover.redeem', 'carryover', id, { code: result.rows[0].code });

    res.json({ success: true, data: shapeRow(result.rows[0]) });
  } catch (error) {
    console.error('redeemCarryover error:', error);
    res.status(500).json({ success: false, message: 'Server error redeeming carryover' });
  }
};

module.exports = { getMyCarryovers, getAllCarryovers, redeemCarryover };
