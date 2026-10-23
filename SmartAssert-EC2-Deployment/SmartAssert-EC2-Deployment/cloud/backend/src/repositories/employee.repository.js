const db = require('../config/database');

class EmployeeRepository {
  /**
   * Retrieves all employees with optional search, department/status filter, and pagination.
   */
  async findAll({ search = null, department = null, status = null, page = 1, limit = 50 } = {}) {
    let whereClauses = [];
    let params = [];

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      whereClauses.push('(employee_code LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR email LIKE ?)');
      params.push(term, term, term, term);
    }

    if (department && department.trim()) {
      whereClauses.push('department = ?');
      params.push(department.trim());
    }

    if (status && status.trim()) {
      whereClauses.push('status = ?');
      params.push(status.trim());
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Count total matching records
    const countRow = await db.get(
      `SELECT COUNT(*) AS total FROM employees ${whereSql}`,
      params
    );
    const total = countRow ? countRow.total : 0;

    // Fetch paginated rows with assigned asset count
    const offset = (Math.max(1, page) - 1) * limit;
    const querySql = `
      SELECT e.*,
        (SELECT COUNT(*) FROM assets a WHERE a.current_employee_id = e.id) AS assigned_assets_count
      FROM employees e
      ${whereSql}
      ORDER BY e.id DESC
      LIMIT ? OFFSET ?
    `;

    const employees = await db.query(querySql, [...params, limit, offset]);

    return {
      employees,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit) || 1
      }
    };
  }

  /**
   * Finds an employee by ID, including currently assigned hardware assets.
   */
  async findById(id) {
    const employee = await db.get(
      'SELECT * FROM employees WHERE id = ?',
      [id]
    );
    if (!employee) return null;

    const assignedAssets = await db.query(
      `SELECT id, asset_tag, name, category, manufacturer, model, status, purchase_date
       FROM assets
       WHERE current_employee_id = ?
       ORDER BY name ASC`,
      [id]
    );

    return {
      ...employee,
      assignedAssets
    };
  }

  /**
   * Finds an employee by unique employee code.
   */
  async findByCode(code) {
    return await db.get(
      'SELECT * FROM employees WHERE employee_code = ?',
      [code]
    );
  }

  /**
   * Finds an employee by email address.
   */
  async findByEmail(email) {
    return await db.get(
      'SELECT * FROM employees WHERE LOWER(email) = LOWER(?)',
      [email]
    );
  }

  /**
   * Checks if employee has custody history or active allocations.
   */
  async getCustodyHistoryCount(employeeId) {
    const historyRow = await db.get(
      'SELECT COUNT(*) AS count FROM asset_assignment_history WHERE employee_id = ?',
      [employeeId]
    );
    const activeAssetsRow = await db.get(
      'SELECT COUNT(*) AS count FROM assets WHERE current_employee_id = ?',
      [employeeId]
    );
    const activeLicensesRow = await db.get(
      'SELECT COUNT(*) AS count FROM license_allocations WHERE employee_id = ?',
      [employeeId]
    );

    return {
      historyCount: historyRow ? historyRow.count : 0,
      activeAssetsCount: activeAssetsRow ? activeAssetsRow.count : 0,
      activeLicensesCount: activeLicensesRow ? activeLicensesRow.count : 0
    };
  }

  /**
   * Creates a new employee record.
   */
  async create({ employeeCode, firstName, lastName, email, department, designation, status = 'ACTIVE' }) {
    const result = await db.run(
      `INSERT INTO employees (employee_code, first_name, last_name, email, department, designation, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [employeeCode, firstName, lastName, email, department, designation, status]
    );

    return await this.findById(result.lastID);
  }

  /**
   * Updates an existing employee record.
   */
  async update(id, { employeeCode, firstName, lastName, email, department, designation, status }) {
    await db.run(
      `UPDATE employees
       SET employee_code = ?,
           first_name = ?,
           last_name = ?,
           email = ?,
           department = ?,
           designation = ?,
           status = ?,
           updated_at = DATETIME('now')
       WHERE id = ?`,
      [employeeCode, firstName, lastName, email, department, designation, status, id]
    );

    return await this.findById(id);
  }

  /**
   * Safely deletes an employee record if no foreign key references exist.
   */
  async delete(id) {
    return await db.run(
      'DELETE FROM employees WHERE id = ?',
      [id]
    );
  }
}

module.exports = new EmployeeRepository();
