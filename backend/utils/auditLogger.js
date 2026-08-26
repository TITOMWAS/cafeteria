const pool = require('../config/database');

// Record a privileged action into the audit trail. Never throws - auditing
// must not break the main request flow.
const logAudit = async (req, action, entityType = null, entityId = null, details = null) => {
  try {
    await pool.query(
      `INSERT INTO audit_logs (actor_id, actor_name, action, entity_type, entity_id, details, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        req?.user?.id || null,
        req?.user?.name || req?.user?.student_id || (req?.user?.id ? `user #${req.user.id}` : 'system'),
        action,
        entityType,
        entityId != null ? String(entityId) : null,
        details ? JSON.stringify(details) : null,
        req?.ip || null,
      ]
    );
  } catch (error) {
    console.error('logAudit error:', error.message);
  }
};

module.exports = { logAudit };
