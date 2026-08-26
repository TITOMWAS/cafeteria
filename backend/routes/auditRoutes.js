const express = require('express');
const router = express.Router();
const { getAuditLogs } = require('../controllers/auditController');
const { protect, requireRole } = require('../middleware/authMiddleware');

router.get('/', protect, requireRole('admin'), getAuditLogs);

module.exports = router;
