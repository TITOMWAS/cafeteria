// Validates request body fields for auth endpoints

const validateLogin = (req, res, next) => {
  const { student_id, password } = req.body;
  if (!student_id || !password) {
    return res.status(400).json({ success: false, message: 'Student ID and password are required' });
  }
  if (typeof student_id !== 'string' || student_id.trim().length < 3) {
    return res.status(400).json({ success: false, message: 'Student ID must be at least 3 characters' });
  }
  next();
};

const validateStaffLogin = (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required' });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ success: false, message: 'Invalid email address' });
  }
  next();
};

const validateRegister = (req, res, next) => {
  const { student_id, name, password } = req.body;
  if (!student_id || !name || !password) {
    return res.status(400).json({ success: false, message: 'Student ID, name and password are required' });
  }
  if (typeof student_id !== 'string' || student_id.trim().length < 3) {
    return res.status(400).json({ success: false, message: 'Student ID must be at least 3 characters' });
  }
  if (typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ success: false, message: 'Name must be at least 2 characters' });
  }
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
  }
  next();
};

module.exports = { validateLogin, validateStaffLogin, validateRegister };
