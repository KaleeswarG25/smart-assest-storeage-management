const db = require('../config/database');

class AuditRepository {
  /**
   * Appends an immutable audit log record.
   */
  async log({ adminId = null, action, entityType = 'AUTH', entityId = null, details = null }) {
    const detailsJson = details && typeof details === 'object' ? JSON.stringify(details) : details;
    return await db.run(
      `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, details)
       VALUES (?, ?, ?, ?, ?)`,
      [adminId, action, entityType, entityId, detailsJson]
    );
  }
}

module.exports = new AuditRepository();
