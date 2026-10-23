const db = require('../config/database');

class AllocationRepository {
  /**
   * Retrieves all allocations for a given license, including employee and asset details.
   */
  async findByLicenseId(licenseId) {
    const sql = `
      SELECT
        la.*,
        e.employee_code,
        e.first_name AS employee_first_name,
        e.last_name AS employee_last_name,
        (e.first_name || ' ' || e.last_name) AS employee_name,
        e.email AS employee_email,
        e.department AS employee_department,
        e.status AS employee_status,
        a.asset_tag,
        a.name AS asset_name
      FROM license_allocations la
      LEFT JOIN employees e ON la.employee_id = e.id
      LEFT JOIN assets a ON la.asset_id = a.id
      WHERE la.license_id = ?
      ORDER BY la.id DESC
    `;
    return await db.query(sql, [licenseId]);
  }

  /**
   * Retrieves a single allocation by primary key.
   */
  async findById(id) {
    const sql = `
      SELECT
        la.*,
        e.employee_code,
        e.first_name AS employee_first_name,
        e.last_name AS employee_last_name,
        (e.first_name || ' ' || e.last_name) AS employee_name,
        e.email AS employee_email,
        e.department AS employee_department,
        a.asset_tag,
        a.name AS asset_name
      FROM license_allocations la
      LEFT JOIN employees e ON la.employee_id = e.id
      LEFT JOIN assets a ON la.asset_id = a.id
      WHERE la.id = ?
    `;
    return await db.get(sql, [id]);
  }

  /**
   * Checks whether an active (non-revoked) allocation exists for a given employee and license.
   */
  async findActiveByLicenseAndEmployee(licenseId, employeeId) {
    if (!employeeId) return null;
    return await db.get(
      `SELECT * FROM license_allocations
       WHERE license_id = ? AND employee_id = ? AND revoked_at IS NULL`,
      [licenseId, employeeId]
    );
  }

  /**
   * Inserts an allocation record.
   */
  async create({ licenseId, employeeId = null, assetId = null, notes = null }) {
    const result = await db.run(
      `INSERT INTO license_allocations (
         license_id, employee_id, asset_id, allocated_at, revoked_at, notes
       ) VALUES (?, ?, ?, DATETIME('now'), NULL, ?)`,
      [
        licenseId,
        employeeId || null,
        assetId || null,
        notes && notes.trim() ? notes.trim() : null
      ]
    );
    return await this.findById(result.lastID);
  }

  /**
   * Revokes an active allocation by setting revoked_at timestamp.
   */
  async revoke(id, licenseId) {
    return await db.run(
      `UPDATE license_allocations
       SET revoked_at = DATETIME('now')
       WHERE id = ? AND license_id = ? AND revoked_at IS NULL`,
      [id, licenseId]
    );
  }
}

module.exports = new AllocationRepository();
