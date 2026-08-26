const pool = require('../config/database');

// POST /api/notifications - admin broadcasts a notification
const createNotification = async (req, res) => {
  try {
    const { title, message, type, target_role } = req.body;
    if (!title || !message) {
      return res.status(400).json({ success: false, message: 'Title and message are required' });
    }
    const validTypes = ['info', 'success', 'warning', 'error'];
    const validRoles = ['all', 'student', 'staff', 'admin'];
    const t = validTypes.includes(type) ? type : 'info';
    const role = validRoles.includes(target_role) ? target_role : 'all';

    const result = await pool.query(
      `INSERT INTO notifications (title, message, type, target_role, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [title.trim(), message.trim(), t, role, req.user.id]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('createNotification error:', error);
    res.status(500).json({ success: false, message: 'Server error creating notification' });
  }
};

// GET /api/notifications - list notifications visible to the logged-in user
// Admins also receive ?scope=all to review everything they have sent.
const getNotifications = async (req, res) => {
  try {
    const { user } = req;
    const scopeAll = req.query.scope === 'all' && user.role === 'admin';

    const query = scopeAll
      ? `SELECT n.*, u.name AS sender_name,
                (SELECT COUNT(*) FROM notification_reads r WHERE r.notification_id = n.id) AS read_count,
                false AS is_read
         FROM notifications n LEFT JOIN users u ON u.id = n.created_by
         ORDER BY n.created_at DESC LIMIT 100`
      : `SELECT n.*, u.name AS sender_name,
                EXISTS (SELECT 1 FROM notification_reads r
                        WHERE r.notification_id = n.id AND r.user_id = $1) AS is_read
         FROM notifications n LEFT JOIN users u ON u.id = n.created_by
         WHERE n.target_role = 'all' OR n.target_role = $2
         ORDER BY n.created_at DESC LIMIT 50`;

    const params = scopeAll ? [] : [user.id, user.role];
    const result = await pool.query(query, params);
    const rows = result.rows.map((n) => ({ ...n, is_read: Boolean(n.is_read) }));
    res.json({
      success: true,
      data: rows,
      unread_count: rows.filter((n) => !n.is_read).length,
    });
  } catch (error) {
    console.error('getNotifications error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching notifications' });
  }
};

// PATCH /api/notifications/:id/read - mark one notification as read
const markRead = async (req, res) => {
  try {
    await pool.query(
      'INSERT INTO notification_reads (notification_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('markRead error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// PATCH /api/notifications/read-all - mark every visible notification as read
const markAllRead = async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO notification_reads (notification_id, user_id)
       SELECT n.id, $1 FROM notifications n
       WHERE (n.target_role = 'all' OR n.target_role = $2)
         AND NOT EXISTS (SELECT 1 FROM notification_reads r WHERE r.notification_id = n.id AND r.user_id = $1)
       ON CONFLICT DO NOTHING`,
      [req.user.id, req.user.role]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('markAllRead error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// DELETE /api/notifications/:id - admin removes a notification
const deleteNotification = async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM notifications WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('deleteNotification error:', error);
    res.status(500).json({ success: false, message: 'Server error deleting notification' });
  }
};

module.exports = { createNotification, getNotifications, markRead, markAllRead, deleteNotification };
