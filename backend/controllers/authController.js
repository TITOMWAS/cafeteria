const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { generateSecret, verifyToken, otpauthUri } = require('../utils/totp');
const { verifyTurnstile } = require('../utils/turnstile');
const { isValidStudentReg, normalizeStudentReg, STUDENT_REG_HINT } = require('../utils/validators');

// Shared guard: Cloudflare Turnstile (no-op until TURNSTILE_SECRET_KEY is configured)
const captchaGuard = async (req, res) => {
  const error = await verifyTurnstile(req);
  if (error) {
    res.status(403).json({ success: false, message: error, code: 'TURNSTILE_FAILED' });
    return false;
  }
  return true;
};

// Access tokens are short-lived; refresh tokens last a week and can mint new access tokens.
const signAccessToken = (user) =>
  jwt.sign(
    { id: user.id, role: user.role, student_id: user.student_id },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );

const signRefreshToken = (user) =>
  jwt.sign(
    { id: user.id, role: user.role, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET || `${process.env.JWT_SECRET}_refresh`,
    { expiresIn: '7d' }
  );

// POST /api/auth/login
const login = async (req, res) => {
  try {
    if (!(await captchaGuard(req, res))) return;
    const { student_id, password } = req.body;
    if (!student_id || !password) {
      return res.status(400).json({ success: false, message: 'Student ID and password are required' });
    }

    // Reg numbers are stored uppercase - normalize whatever casing was typed
    const result = await pool.query('SELECT * FROM users WHERE student_id = $1', [normalizeStudentReg(student_id)]);
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = signAccessToken(user);
    const refresh_token = signRefreshToken(user);

    res.json({
      success: true,
      token,
      refresh_token,
      user: { id: user.id, name: user.name, email: user.email, student_id: user.student_id, role: user.role, phone: user.phone, theme_preference: user.theme_preference }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
};

// POST /api/auth/register (admin creates new users)
const register = async (req, res) => {
  try {
    const { student_id, name, email, password, phone, role } = req.body;
    if (!student_id || !name || !password) {
      return res.status(400).json({ success: false, message: 'Student ID, name and password are required' });
    }

    // Strict student reg-number format (e.g. CT207/119148/24) for student accounts
    const normalizedStudentId = normalizeStudentReg(student_id);
    const assignedRole = role || 'student';
    if (assignedRole === 'student' && !isValidStudentReg(normalizedStudentId)) {
      return res.status(400).json({ success: false, message: `Invalid Student ID format. ${STUDENT_REG_HINT}` });
    }

    const existing = await pool.query('SELECT id FROM users WHERE student_id = $1 OR email = $2', [normalizedStudentId, email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'User already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const result = await pool.query(
      `INSERT INTO users (student_id, name, email, password_hash, phone, role, theme_preference)
       VALUES ($1, $2, $3, $4, $5, $6, 'dark') RETURNING id, student_id, name, email, phone, role`,
      [normalizedStudentId, name, email, password_hash, phone || '', assignedRole]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: 'Server error during registration' });
  }
};

// POST /api/auth/staff-login
// - Management (admin): email + password + mandatory authenticator code. Without an
//   enrolled secret the login is refused so the dashboard is never reachable without OTP.
// - Staff (cashier): provisioned by the admin — signs in with just email + password.
const staffLogin = async (req, res) => {
  try {
    if (!(await captchaGuard(req, res))) return;
    const { email, password, token } = req.body;
    const result = await pool.query("SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND role IN ('staff', 'admin')", [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (user.role === 'admin') {
      // Management console is OTP-gated, always.
      if (!user.totp_secret) {
        return res.status(403).json({
          success: false,
          message: 'Management access requires two-factor authentication. Set up 2FA first.',
          code: 'TOTP_ENROLLMENT_REQUIRED',
        });
      }
      if (!token) {
        return res.status(401).json({ success: false, message: 'Authenticator code required', code: 'TOTP_REQUIRED' });
      }
      if (!verifyToken(user.totp_secret, token)) {
        return res.status(401).json({ success: false, message: 'Invalid or expired authenticator code', code: 'TOTP_INVALID' });
      }
    }

    const token_jwt = signAccessToken(user);
    const refresh_token = signRefreshToken(user);
    res.json({
      success: true,
      token: token_jwt,
      refresh_token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      totp_enrolled: Boolean(user.totp_secret)
    });
  } catch (error) {
    console.error('staffLogin error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// POST /api/auth/totp/setup - generate & store a TOTP secret for a staff/admin user.
// Requires valid email+password; returns an otpauth:// URI to scan with an authenticator app.
const setupTotp = async (req, res) => {
  try {
    if (!(await captchaGuard(req, res))) return;
    const { email, password } = req.body;
    const result = await pool.query("SELECT * FROM users WHERE email = $1 AND role IN ('staff', 'admin')", [email]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Staff account not found' });
    }
    const user = result.rows[0];
    if (user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Two-factor authentication applies to management accounts only' });
    }
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const secret = generateSecret();
    await pool.query('UPDATE users SET totp_secret = $1 WHERE id = $2', [secret, user.id]);

    res.json({
      success: true,
      data: {
        otpauth_uri: otpauthUri({ label: `Synapse Cafeteria (${user.email})`, secret }),
        message: 'Scan the QR code with your authenticator app, then sign in using the 6-digit code.'
      }
    });
  } catch (error) {
    console.error('TOTP setup error:', error);
    res.status(500).json({ success: false, message: 'Server error during TOTP setup' });
  }
};

// POST /api/auth/totp/reset - admin removes a staff/admin TOTP secret (account recovery)
const resetTotp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }
    const result = await pool.query(
      "UPDATE users SET totp_secret = NULL WHERE email = $1 AND role IN ('staff', 'admin') RETURNING id",
      [email]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Staff account not found' });
    }
    res.json({ success: true, message: `2FA reset for ${email}. They can enroll again on next login.` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// POST /api/auth/refresh - exchange a refresh token for a fresh access token
const refreshToken = async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      return res.status(400).json({ success: false, message: 'Refresh token is required' });
    }
    let decoded;
    try {
      decoded = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET || `${process.env.JWT_SECRET}_refresh`);
    } catch {
      return res.status(401).json({ success: false, message: 'Refresh token invalid or expired', code: 'REFRESH_INVALID' });
    }
    if (decoded.type !== 'refresh') {
      return res.status(401).json({ success: false, message: 'Invalid token type' });
    }
    const result = await pool.query('SELECT id, role, student_id FROM users WHERE id = $1', [decoded.id]);
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Account no longer exists' });
    }
    res.json({ success: true, token: signAccessToken(result.rows[0]) });
  } catch (error) {
    console.error('refreshToken error:', error);
    res.status(500).json({ success: false, message: 'Server error refreshing token' });
  }
};

// POST /api/auth/forgot-password - start a password reset.
// No mailer is configured in this build, so the one-time reset link is returned
// directly (dev mode) and logged on the server. Swap the transport for real email later.
const forgotPassword = async (req, res) => {
  try {
    if (!(await captchaGuard(req, res))) return;
    const { identifier } = req.body; // student_id or email
    if (!identifier) {
      return res.status(400).json({ success: false, message: 'Student ID or email is required' });
    }
    const result = await pool.query(
      'SELECT id, name, email FROM users WHERE LOWER(student_id) = LOWER($1) OR LOWER(email) = LOWER($1)',
      [String(identifier).trim()]
    );
    // Do not reveal whether the account exists
    const generic = { success: true, message: 'If that account exists, a reset link has been generated.' };
    if (result.rows.length === 0) return res.json(generic);

    const user = result.rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await pool.query(
      'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, tokenHash, expiresAt]
    );
    console.log(`🔑 Password reset requested for ${user.email || user.name}. Token: ${token}`);

    res.json({
      ...generic,
      // Dev-mode convenience until an email service is wired in:
      reset_token: token,
      reset_link: `/reset-password?token=${token}`,
    });
  } catch (error) {
    console.error('forgotPassword error:', error);
    res.status(500).json({ success: false, message: 'Server error requesting reset' });
  }
};

// POST /api/auth/reset-password - complete a password reset with a valid token
const resetPassword = async (req, res) => {
  try {
    const { token, new_password } = req.body;
    if (!token || !new_password) {
      return res.status(400).json({ success: false, message: 'Token and new password are required' });
    }
    if (String(new_password).length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const resetRes = await pool.query(
      `SELECT pr.id, pr.user_id FROM password_resets pr
       WHERE pr.token_hash = $1 AND pr.used = false AND pr.expires_at > NOW()
       ORDER BY pr.created_at DESC LIMIT 1`,
      [tokenHash]
    );
    if (resetRes.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Reset link is invalid or has expired' });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(new_password, salt);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [password_hash, resetRes.rows[0].user_id]);
    await pool.query('UPDATE password_resets SET used = true WHERE id = $1', [resetRes.rows[0].id]);
    res.json({ success: true, message: 'Password updated. You can now sign in with your new password.' });
  } catch (error) {
    console.error('resetPassword error:', error);
    res.status(500).json({ success: false, message: 'Server error resetting password' });
  }
};

module.exports = { login, register, staffLogin, setupTotp, resetTotp, refreshToken, forgotPassword, resetPassword, captchaGuard };
