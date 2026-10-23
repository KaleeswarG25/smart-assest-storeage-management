const db = require('../config/database');

class LicenseRepository {
  /**
   * Retrieves all software licenses with search, type/status filters, and pagination.
   */
  async findAll({ search = null, type = null, status = null, page = 1, limit = 50 } = {}) {
    let whereClauses = [];
    let params = [];

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      whereClauses.push('(l.software_name LIKE ? OR l.vendor LIKE ? OR l.license_code LIKE ?)');
      params.push(term, term, term);
    }

    if (type && type.trim()) {
      whereClauses.push('l.license_type = ?');
      params.push(type.trim());
    }

    if (status && status.trim()) {
      whereClauses.push('l.renewal_status = ?');
      params.push(status.trim());
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRow = await db.get(
      `SELECT COUNT(*) AS total FROM software_licenses l ${whereSql}`,
      params
    );
    const total = countRow ? countRow.total : 0;

    const offset = (Math.max(1, page) - 1) * limit;
    const querySql = `
      SELECT
        l.*,
        (l.total_quantity - l.used_quantity) AS available_quantity
      FROM software_licenses l
      ${whereSql}
      ORDER BY l.id DESC
      LIMIT ? OFFSET ?
    `;

    const queryParams = [...params, limit, offset];
    const licenses = await db.query(querySql, queryParams);

    return {
      licenses,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit) || 1
      }
    };
  }

  /**
   * Finds a single license by primary key with derived available quantity.
   */
  async findById(id) {
    return await db.get(
      `SELECT
         l.*,
         (l.total_quantity - l.used_quantity) AS available_quantity
       FROM software_licenses l
       WHERE l.id = ?`,
      [id]
    );
  }

  /**
   * Finds a license by its unique license code.
   */
  async findByCode(licenseCode) {
    if (!licenseCode) return null;
    return await db.get(
      'SELECT * FROM software_licenses WHERE LOWER(license_code) = LOWER(?)',
      [licenseCode.trim()]
    );
  }

  /**
   * Inserts a new software license record.
   */
  async create(data) {
    const {
      license_code,
      software_name,
      vendor,
      license_type,
      total_quantity,
      used_quantity = 0,
      purchase_date,
      expiry_date = null,
      purchase_cost = 0.00,
      renewal_status = 'ACTIVE',
      notes = null
    } = data;

    const result = await db.run(
      `INSERT INTO software_licenses (
         license_code, software_name, vendor, license_type, total_quantity,
         used_quantity, purchase_date, expiry_date, purchase_cost, renewal_status, notes,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATETIME('now'), DATETIME('now'))`,
      [
        license_code.trim(),
        software_name.trim(),
        vendor.trim(),
        license_type.trim(),
        total_quantity,
        used_quantity,
        purchase_date,
        expiry_date,
        purchase_cost,
        renewal_status.trim(),
        notes && notes.trim() ? notes.trim() : null
      ]
    );

    return await this.findById(result.lastID);
  }

  /**
   * Updates an existing software license's metadata.
   * Note: used_quantity is NOT updatable via this method; it is managed strictly
   * by allocation and revocation lifecycle operations.
   */
  async update(id, data) {
    const {
      license_code,
      software_name,
      vendor,
      license_type,
      total_quantity,
      purchase_date,
      expiry_date,
      purchase_cost,
      renewal_status,
      notes
    } = data;

    await db.run(
      `UPDATE software_licenses
       SET license_code = ?,
           software_name = ?,
           vendor = ?,
           license_type = ?,
           total_quantity = ?,
           purchase_date = ?,
           expiry_date = ?,
           purchase_cost = ?,
           renewal_status = ?,
           notes = ?,
           updated_at = DATETIME('now')
       WHERE id = ?`,
      [
        license_code.trim(),
        software_name.trim(),
        vendor.trim(),
        license_type.trim(),
        total_quantity,
        purchase_date,
        expiry_date,
        purchase_cost,
        renewal_status.trim(),
        notes && notes.trim() ? notes.trim() : null,
        id
      ]
    );

    return await this.findById(id);
  }

  /**
   * Deletes a license record.
   */
  async delete(id) {
    return await db.run('DELETE FROM software_licenses WHERE id = ?', [id]);
  }

  /**
   * Checks whether any historical or active allocations exist for this license.
   */
  async hasAllocations(licenseId) {
    const row = await db.get(
      'SELECT COUNT(*) AS total FROM license_allocations WHERE license_id = ?',
      [licenseId]
    );
    return row ? row.total > 0 : false;
  }

  /**
   * Counts active (non-revoked) seat allocations for this license.
   */
  async getActiveAllocationCount(licenseId) {
    const row = await db.get(
      'SELECT COUNT(*) AS total FROM license_allocations WHERE license_id = ? AND revoked_at IS NULL',
      [licenseId]
    );
    return row ? row.total : 0;
  }
}

module.exports = new LicenseRepository();
