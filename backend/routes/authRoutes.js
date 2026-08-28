const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { login, register, staffLogin, setupTotp, resetTotp, refreshToken, forgotPassword, resetPassword, captchaGuard } = require('../controllers/authController');
const { protect, requireRole } = require('../middleware/authMiddleware');
const { validateLogin, validateStaffLogin, validateRegister } = require('../middleware/validateMiddleware');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  message: { success: false, message: 'Too many attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', authLimiter, validateLogin, login);
router.post('/staff-login', authLimiter, validateStaffLogin, staffLogin);
router.post('/refresh', refreshToken);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password', authLimiter, resetPassword);

// TOTP (authenticator app) management for staff/admin accounts
router.post('/totp/setup', authLimiter, validateStaffLogin, setupTotp);
router.post('/totp/reset', protect, requireRole('admin'), resetTotp);

// Self-registration: anyone can register as student. Only admins can assign other roles.
router.post('/register', validateRegister, (req, res, next) => {
  const role = req.body.role;
  if (role && role !== 'student') {
    // Non-student registration requires admin auth
    return protect(req, res, () => requireRole('admin')(req, res, next));
  }
  // Public self-registration is captcha-gated (Cloudflare Turnstile).
  // Admin-created accounts are already authenticated, so they skip the challenge.
  (async () => {
    if (!(await captchaGuard(req, res))) return;
    next();
  })();
}, register);

module.exports = router;

