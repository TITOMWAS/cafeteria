const pool = require('../config/database');

// GET /api/audit?page=&limit=&action= - recent audit trail entries (admin)
const getAuditLogs = async (req, res) => {
  try {
    const { action, page, limit } = req.query;
    const conditions = [];
    const params = [];
    if (action) {
      params.push(`${action}%`);
      conditions.push(`action LIKE $${params.length}`);
    }
    let where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM audit_logs ${where}`, params);
    const total = countRes.rows[0].total;

    if (!page) {
      const result = await pool.query(`SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT 200`, params);
      return res.json({ success: true, data: result.rows, total });
    }

    const pageNum = Math.max(parseInt(page) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit) || 25, 1), 100);
    const result = await pool.query(
      `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, (pageNum - 1) * pageSize]
    );
    res.json({
      success: true,
      data: result.rows,
      total,
      page: pageNum,
      pages: Math.max(Math.ceil(total / pageSize), 1),
    });
  } catch (error) {
    console.error('getAuditLogs error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching audit logs' });
  }
};

module.exports = { getAuditLogs };
