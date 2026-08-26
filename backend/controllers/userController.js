const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const { logAudit } = require('../utils/auditLogger');
const { isValidStudentReg, normalizeStudentReg, STUDENT_REG_HINT } = require('../utils/validators');

// GET /api/users/profile
const getProfile = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, student_id, name, email, phone, role, theme_preference FROM users WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// PATCH /api/users/profile
const updateProfile = async (req, res) => {
  try {
    const { name, phone, theme_preference } = req.body;
    const result = await pool.query(
      'UPDATE users SET name = COALESCE($1, name), phone = COALESCE($2, phone), theme_preference = COALESCE($3, theme_preference) WHERE id = $4 RETURNING id, student_id, name, email, phone, role, theme_preference',
      [name, phone, theme_preference, req.user.id]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// PATCH /api/users/profile/password - change own password
const changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ success: false, message: 'Current and new password are required' });
    }
    if (String(new_password).length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
    }

    const userRes = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const ok = await bcrypt.compare(current_password, userRes.rows[0].password_hash);
    if (!ok) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(new_password, salt);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('changePassword error:', error);
    res.status(500).json({ success: false, message: 'Server error changing password' });
  }
};

// GET /api/users - full directory with order stats (admin)
// Supports ?search=&role=&page=&limit= for server-side search + pagination.
// Omitting `page` returns the full list (legacy behaviour).
const getAllUsers = async (req, res) => {
  try {
    const { search, role, page, limit } = req.query;
    const params = [];
    const conditions = [];

    if (search && String(search).trim()) {
      params.push(`%${String(search).trim().toLowerCase()}%`);
      const p = `$${params.length}`;
      conditions.push(`(LOWER(u.name) LIKE ${p} OR LOWER(COALESCE(u.email, '')) LIKE ${p} OR LOWER(COALESCE(u.student_id, '')) LIKE ${p} OR COALESCE(u.phone, '') LIKE ${p})`);
    }
    if (role && ['student', 'staff', 'admin'].includes(role)) {
      params.push(role);
      conditions.push(`u.role = $${params.length}`);
    }
    let where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const baseQuery = `
      FROM users u
      LEFT JOIN LATERAL (
        SELECT
          COUNT(DISTINCT o.id) AS order_count,
          COALESCE(SUM(DISTINCT o.total_amount), 0) AS total_spent
        FROM orders o WHERE o.user_id = u.id
      ) stats ON true
      ${where}`;

    if (page) {
      const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM users u ${where}`, params);
      const total = countRes.rows[0].total;
      const pageNum = Math.max(parseInt(page) || 1, 1);
      const pageSize = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
      const rowsRes = await pool.query(`
        SELECT u.id, u.student_id, u.name, u.email, u.phone, u.role,
               u.totp_secret IS NOT NULL AS totp_enrolled,
               u.created_at,
               COALESCE(stats.order_count, 0)  AS order_count,
               COALESCE(stats.total_spent, 0)  AS total_spent
        ${baseQuery}
        ORDER BY u.role = 'admin' DESC, u.role = 'staff' DESC, u.name
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, pageSize, (pageNum - 1) * pageSize]
      );
      return res.json({
        success: true,
        data: rowsRes.rows.map((u) => ({ ...u, total_spent: parseFloat(u.total_spent) })),
        total,
        page: pageNum,
        pages: Math.max(Math.ceil(total / pageSize), 1),
      });
    }

    const result = await pool.query(`
      SELECT u.id, u.student_id, u.name, u.email, u.phone, u.role,
             u.totp_secret IS NOT NULL AS totp_enrolled,
             u.created_at,
             COALESCE(stats.order_count, 0)  AS order_count,
             COALESCE(stats.total_spent, 0)  AS total_spent
      ${baseQuery}
      ORDER BY u.role = 'admin' DESC, u.role = 'staff' DESC, u.name`,
      params
    );
    res.json({
      success: true,
      data: result.rows.map((u) => ({ ...u, total_spent: parseFloat(u.total_spent) })),
    });
  } catch (error) {
    console.error('getAllUsers error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching users' });
  }
};

// POST /api/users - admin creates any user (student/staff/admin)
const createUser = async (req, res) => {
  try {
    const { student_id, name, email, password, phone, role } = req.body;
    if (!name || !password || (!student_id && !email)) {
      return res.status(400).json({ success: false, message: 'Name, password and either Student ID or email are required' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    const validRoles = ['student', 'staff', 'admin'];
    const assignedRole = validRoles.includes(role) ? role : 'student';

    // Student reg numbers must follow the strict institutional format
    let normalizedStudentId = student_id ? normalizeStudentReg(student_id) : null;
    if (assignedRole === 'student') {
      if (!normalizedStudentId) {
        return res.status(400).json({ success: false, message: `Student ID is required. ${STUDENT_REG_HINT}` });
      }
      if (!isValidStudentReg(normalizedStudentId)) {
        return res.status(400).json({ success: false, message: `Invalid Student ID format. ${STUDENT_REG_HINT}` });
      }
    }

    const existing = await pool.query(
      'SELECT id FROM users WHERE student_id = $1 OR (email IS NOT NULL AND email = $2)',
      [normalizedStudentId || '', email || '']
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'A user with that ID or email already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const result = await pool.query(
      `INSERT INTO users (student_id, name, email, password_hash, phone, role)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, student_id, name, email, phone, role`,
      [normalizedStudentId || null, name.trim(), email || null, password_hash, phone || null, assignedRole]
    );
    logAudit(req, 'user.create', 'user', result.rows[0].id, { name: result.rows[0].name, role: result.rows[0].role });
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('createUser error:', error);
    res.status(500).json({ success: false, message: 'Server error creating user' });
  }
};

// PATCH /api/users/:id - admin edits a user (role, details, optional password reset)
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, student_id, role, password } = req.body;

    const target = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (target.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const targetUser = target.rows[0];

    // Never demote/exclude the final active admin out of the admin role
    if (targetUser.role === 'admin' && role && role !== 'admin') {
      const admins = await pool.query("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'");
      if (parseInt(admins.rows[0].count) <= 1) {
        return res.status(400).json({ success: false, message: 'Cannot demote the only admin account' });
      }
    }

    const validRoles = ['student', 'staff', 'admin'];
    let password_hash;
    if (password) {
      if (String(password).length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
      }
      const salt = await bcrypt.genSalt(10);
      password_hash = await bcrypt.hash(password, salt);
    }

    // Role changes clear TOTP so the account re-enrolls cleanly under the new privilege level
    const clearTotp = role && role !== targetUser.role;

    // Enforce the strict student reg-number format whenever a student's ID is set or changed
    let normalizedStudentId = student_id ? normalizeStudentReg(student_id) : null;
    if (normalizedStudentId) {
      const effectiveRole = role && validRoles.includes(role) ? role : targetUser.role;
      if (effectiveRole === 'student' && !isValidStudentReg(normalizedStudentId)) {
        return res.status(400).json({ success: false, message: `Invalid Student ID format. ${STUDENT_REG_HINT}` });
      }
    }

    const result = await pool.query(
      `UPDATE users SET
         name = COALESCE($1, name),
         email = COALESCE($2, email),
         phone = COALESCE($3, phone),
         student_id = COALESCE($4, student_id),
         role = COALESCE($5, role),
         password_hash = COALESCE($6, password_hash),
         totp_secret = CASE WHEN $7 THEN NULL ELSE totp_secret END
       WHERE id = $8
       RETURNING id, student_id, name, email, phone, role`,
      [name ?? null, email ?? null, phone ?? null, normalizedStudentId ?? null,
       role && validRoles.includes(role) ? role : null,
       password_hash ?? null, Boolean(clearTotp), id]
    );
    logAudit(req, 'user.update', 'user', id, { name, role, password_changed: Boolean(password) });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('updateUser error:', error);
    res.status(500).json({ success: false, message: 'Server error updating user' });
  }
};

// DELETE /api/users/:id - admin removes a user
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (Number(id) === Number(req.user.id)) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own account' });
    }
    const target = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (target.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (target.rows[0].role === 'admin') {
      const admins = await pool.query("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'");
      if (parseInt(admins.rows[0].count) <= 1) {
        return res.status(400).json({ success: false, message: 'Cannot delete the only admin account' });
      }
    }
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    logAudit(req, 'user.delete', 'user', id, { name: target.rows[0].name });
    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    console.error('deleteUser error:', error);
    res.status(500).json({ success: false, message: 'Server error deleting user' });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  changePassword,
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
};
