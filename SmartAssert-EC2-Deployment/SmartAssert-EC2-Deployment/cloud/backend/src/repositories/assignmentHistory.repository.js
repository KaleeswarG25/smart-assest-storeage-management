const db = require('../config/database');

class AssignmentHistoryRepository {
  /**
   * Retrieves full chronological assignment and maintenance history for an asset.
   */
  async findByAssetId(assetId) {
    const querySql = `
      SELECT
        h.id,
        h.asset_id,
        h.employee_id,
        h.action,
        h.action_date,
        h.performed_by_admin_id,
        h.notes,
        e.employee_code,
        e.first_name AS employee_first_name,
        e.last_name AS employee_last_name,
        (e.first_name || ' ' || e.last_name) AS employee_name,
        e.department AS employee_department,
        adm.full_name AS performed_by_admin_name,
        adm.username AS performed_by_admin_username
      FROM asset_assignment_history h
      LEFT JOIN employees e ON h.employee_id = e.id
      LEFT JOIN administrators adm ON h.performed_by_admin_id = adm.id
      WHERE h.asset_id = ?
      ORDER BY h.id DESC
    `;
    return await db.query(querySql, [assetId]);
  }

  /**
   * Inserts an immutable history entry. Accepts transaction executor if inside a transaction.
   */
  async create({ assetId, employeeId = null, action, actionDate = null, performedByAdminId = null, notes = null }, executor = null) {
    const runFn = executor ? executor.run : db.run;
    const dateValue = actionDate || new Date().toISOString().replace('T', ' ').substring(0, 19);

    return await runFn(
      `INSERT INTO asset_assignment_history (
         asset_id, employee_id, action, action_date, performed_by_admin_id, notes
       ) VALUES (?, ?, ?, ?, ?, ?)`,
      [assetId, employeeId, action, dateValue, performedByAdminId, notes]
    );
  }
}

module.exports = new AssignmentHistoryRepository();
