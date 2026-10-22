const db = require('../config/database');

class AssetRepository {
  /**
   * Retrieves all assets with filtering by search, category, status, assignment state, and pagination.
   */
  async findAll({ search = null, category = null, status = null, assigned = null, page = 1, limit = 50 } = {}) {
    let whereClauses = [];
    let params = [];

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      whereClauses.push('(a.asset_tag LIKE ? OR a.name LIKE ? OR a.manufacturer LIKE ? OR a.model LIKE ? OR a.serial_number LIKE ?)');
      params.push(term, term, term, term, term);
    }

    if (category && category.trim()) {
      whereClauses.push('a.category = ?');
      params.push(category.trim());
    }

    if (status && status.trim()) {
      whereClauses.push('a.status = ?');
      params.push(status.trim());
    }

    if (assigned !== null && assigned !== undefined && assigned !== '') {
      const isAssigned = assigned === 'true' || assigned === true || assigned === '1';
      if (isAssigned) {
        whereClauses.push('a.current_employee_id IS NOT NULL');
      } else {
        whereClauses.push('a.current_employee_id IS NULL');
      }
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRow = await db.get(
      `SELECT COUNT(*) AS total FROM assets a ${whereSql}`,
      params
    );
    const total = countRow ? countRow.total : 0;

    const offset = (Math.max(1, page) - 1) * limit;
    const querySql = `
      SELECT
        a.*,
        e.employee_code AS current_employee_code,
        e.first_name AS current_employee_first_name,
        e.last_name AS current_employee_last_name,
        (e.first_name || ' ' || e.last_name) AS current_employee_name,
        e.email AS current_employee_email,
        e.department AS current_employee_department
      FROM assets a
      LEFT JOIN employees e ON a.current_employee_id = e.id
      ${whereSql}
      ORDER BY a.id DESC
      LIMIT ? OFFSET ?
    `;

    const assets = await db.query(querySql, [...params, limit, offset]);

    return {
      assets,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit) || 1
      }
    };
  }

  /**
   * Finds an asset by its primary key ID with current employee details.
   */
  async findById(id) {
    const querySql = `
      SELECT
        a.*,
        e.employee_code AS current_employee_code,
        e.first_name AS current_employee_first_name,
        e.last_name AS current_employee_last_name,
        (e.first_name || ' ' || e.last_name) AS current_employee_name,
        e.email AS current_employee_email,
        e.department AS current_employee_department
      FROM assets a
      LEFT JOIN employees e ON a.current_employee_id = e.id
      WHERE a.id = ?
    `;
    return await db.get(querySql, [id]);
  }

  /**
   * Finds an asset by its unique asset tag.
   */
  async findByTag(assetTag) {
    return await db.get(
      'SELECT * FROM assets WHERE asset_tag = ?',
      [assetTag]
    );
  }

  /**
   * Finds an asset by its unique serial number.
   */
  async findBySerial(serialNumber) {
    if (!serialNumber) return null;
    return await db.get(
      'SELECT * FROM assets WHERE serial_number = ?',
      [serialNumber]
    );
  }

  /**
   * Creates a new physical hardware asset record in AVAILABLE status.
   */
  async create({
    assetTag,
    serialNumber = null,
    name,
    category,
    manufacturer,
    model,
    purchaseDate,
    purchaseCost = 0.0,
    warrantyExpiry = null,
    notes = null,
    billImageUrl = null,
    billImageName = null
  }) {
    const result = await db.run(
      `INSERT INTO assets (
         asset_tag, serial_number, name, category, manufacturer, model,
         purchase_date, purchase_cost, warranty_expiry, status, current_employee_id, notes,
         bill_image_url, bill_image_name
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'AVAILABLE', NULL, ?, ?, ?)`,
      [
        assetTag,
        serialNumber || null,
        name,
        category,
        manufacturer,
        model,
        purchaseDate,
        purchaseCost,
        warrantyExpiry || null,
        notes || null,
        billImageUrl || null,
        billImageName || null
      ]
    );

    return await this.findById(result.lastID);
  }

  /**
   * Updates asset metadata. Prevents silent modifications to current_employee_id or status.
   */
  async update(id, {
    assetTag,
    serialNumber = null,
    name,
    category,
    manufacturer,
    model,
    purchaseDate,
    purchaseCost = 0.0,
    warrantyExpiry = null,
    notes = null,
    billImageUrl = undefined,
    billImageName = undefined
  }) {
    // If billImageUrl is undefined, preserve existing column value; if null or string, update it
    let billClause = '';
    let billParams = [];
    if (billImageUrl !== undefined) {
      billClause += ', bill_image_url = ?';
      billParams.push(billImageUrl);
    }
    if (billImageName !== undefined) {
      billClause += ', bill_image_name = ?';
      billParams.push(billImageName);
    }

    await db.run(
      `UPDATE assets
       SET asset_tag = ?,
           serial_number = ?,
           name = ?,
           category = ?,
           manufacturer = ?,
           model = ?,
           purchase_date = ?,
           purchase_cost = ?,
           warranty_expiry = ?,
           notes = ?
           ${billClause},
           updated_at = DATETIME('now')
       WHERE id = ?`,
      [
        assetTag,
        serialNumber || null,
        name,
        category,
        manufacturer,
        model,
        purchaseDate,
        purchaseCost,
        warrantyExpiry || null,
        notes || null,
        ...billParams,
        id
      ]
    );

    return await this.findById(id);
  }

  /**
   * Updates asset lifecycle status for unassigned assets (AVAILABLE, UNDER_MAINTENANCE, RETIRED).
   */
  async updateStatus(id, newStatus) {
    await db.run(
      `UPDATE assets
       SET status = ?,
           updated_at = DATETIME('now')
       WHERE id = ? AND current_employee_id IS NULL`,
      [newStatus, id]
    );

    return await this.findById(id);
  }

  /**
   * Inspects foreign key references to verify if asset deletion is safe.
   */
  async getHistoricalReferences(assetId) {
    const historyRow = await db.get(
      'SELECT COUNT(*) AS count FROM asset_assignment_history WHERE asset_id = ?',
      [assetId]
    );
    const allocationsRow = await db.get(
      'SELECT COUNT(*) AS count FROM license_allocations WHERE asset_id = ?',
      [assetId]
    );

    return {
      historyCount: historyRow ? historyRow.count : 0,
      allocationsCount: allocationsRow ? allocationsRow.count : 0
    };
  }

  /**
   * Deletes an asset physically if no historical references exist.
   */
  async delete(id) {
    return await db.run(
      'DELETE FROM assets WHERE id = ?',
      [id]
    );
  }
}

module.exports = new AssetRepository();
