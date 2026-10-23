const db = require('../config/database');
const expiryService = require('./expiry.service');

/**
 * Sanitizes a CSV cell value to prevent formula injection attacks.
 * Prefixes dangerous characters (=, +, -, @, \t, \r) with a single quote.
 */
function sanitizeCsvCell(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Escape double quotes by doubling them
  const escaped = str.replace(/"/g, '""');
  // Prevent formula injection
  const dangerousChars = ['=', '+', '-', '@', '\t', '\r'];
  if (dangerousChars.some(c => escaped.startsWith(c))) {
    return `"'${escaped}"`;
  }
  return `"${escaped}"`;
}

/**
 * Converts an array of objects to CSV string with headers.
 */
function arrayToCsv(data, columns) {
  if (!data || data.length === 0) {
    return columns.map(c => sanitizeCsvCell(c.header)).join(',') + '\n';
  }

  const headerRow = columns.map(c => sanitizeCsvCell(c.header)).join(',');
  const dataRows = data.map(row =>
    columns.map(c => sanitizeCsvCell(row[c.key])).join(',')
  );

  return [headerRow, ...dataRows].join('\n') + '\n';
}

class ReportService {
  /**
   * Generates complete asset inventory report.
   */
  async getAssetInventoryReport({ search, category, status } = {}) {
    let whereClauses = [];
    let params = [];

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      whereClauses.push('(a.name LIKE ? OR a.asset_tag LIKE ? OR a.serial_number LIKE ? OR a.manufacturer LIKE ?)');
      params.push(term, term, term, term);
    }
    if (category) {
      whereClauses.push('a.category = ?');
      params.push(category);
    }
    if (status) {
      whereClauses.push('a.status = ?');
      params.push(status);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const assets = await db.query(
      `SELECT
        a.*,
        e.first_name || ' ' || e.last_name AS assigned_employee_name,
        e.employee_code AS assigned_employee_code,
        e.department AS assigned_department
       FROM assets a
       LEFT JOIN employees e ON a.current_employee_id = e.id
       ${whereSql}
       ORDER BY a.id DESC`,
      params
    );

    return assets;
  }

  /**
   * Generates assigned assets report (only ASSIGNED status).
   */
  async getAssignedAssetsReport() {
    return await db.query(
      `SELECT
        a.asset_tag, a.name, a.category, a.manufacturer, a.model,
        a.serial_number, a.purchase_date, a.purchase_cost,
        e.employee_code, e.first_name || ' ' || e.last_name AS employee_name,
        e.department, e.designation, e.email AS employee_email
       FROM assets a
       INNER JOIN employees e ON a.current_employee_id = e.id
       WHERE a.status = 'ASSIGNED'
       ORDER BY e.department, e.last_name`
    );
  }

  /**
   * Generates asset assignment/return history report.
   */
  async getAssignmentHistoryReport() {
    return await db.query(
      `SELECT
        aah.id AS history_id,
        a.asset_tag, a.name AS asset_name, a.category,
        e.employee_code, e.first_name || ' ' || e.last_name AS employee_name,
        e.department,
        aah.action, aah.action_date, aah.notes,
        adm.username AS performed_by
       FROM asset_assignment_history aah
       INNER JOIN assets a ON aah.asset_id = a.id
       LEFT JOIN employees e ON aah.employee_id = e.id
       LEFT JOIN administrators adm ON aah.performed_by_admin_id = adm.id
       ORDER BY aah.action_date DESC`
    );
  }

  /**
   * Generates software license inventory report.
   */
  async getLicenseInventoryReport({ search, type, status } = {}) {
    let whereClauses = [];
    let params = [];

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      whereClauses.push('(l.software_name LIKE ? OR l.vendor LIKE ? OR l.license_code LIKE ?)');
      params.push(term, term, term);
    }
    if (type) {
      whereClauses.push('l.license_type = ?');
      params.push(type);
    }
    if (status) {
      whereClauses.push('l.renewal_status = ?');
      params.push(status);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    return await db.query(
      `SELECT
        l.*,
        (l.total_quantity - l.used_quantity) AS available_quantity
       FROM software_licenses l
       ${whereSql}
       ORDER BY l.id DESC`,
      params
    );
  }

  /**
   * Generates seat utilization report.
   */
  async getSeatUtilizationReport() {
    return await db.query(
      `SELECT
        l.license_code, l.software_name, l.vendor, l.license_type,
        l.total_quantity, l.used_quantity,
        (l.total_quantity - l.used_quantity) AS available_quantity,
        CASE
          WHEN l.total_quantity > 0 THEN ROUND((CAST(l.used_quantity AS REAL) / l.total_quantity) * 100, 1)
          ELSE 0
        END AS utilization_percent,
        l.expiry_date, l.renewal_status
       FROM software_licenses l
       ORDER BY utilization_percent DESC`
    );
  }

  /**
   * Returns CSV string for a given report type.
   */
  async generateCsv(reportType, filters = {}) {
    switch (reportType) {
      case 'asset_inventory': {
        const data = await this.getAssetInventoryReport(filters);
        return arrayToCsv(data, [
          { header: 'Asset Tag', key: 'asset_tag' },
          { header: 'Name', key: 'name' },
          { header: 'Category', key: 'category' },
          { header: 'Manufacturer', key: 'manufacturer' },
          { header: 'Model', key: 'model' },
          { header: 'Serial Number', key: 'serial_number' },
          { header: 'Status', key: 'status' },
          { header: 'Purchase Date', key: 'purchase_date' },
          { header: 'Purchase Cost', key: 'purchase_cost' },
          { header: 'Warranty Expiry', key: 'warranty_expiry' },
          { header: 'Assigned Employee', key: 'assigned_employee_name' },
          { header: 'Employee Code', key: 'assigned_employee_code' },
          { header: 'Department', key: 'assigned_department' },
          { header: 'Notes', key: 'notes' }
        ]);
      }

      case 'assigned_assets': {
        const data = await this.getAssignedAssetsReport();
        return arrayToCsv(data, [
          { header: 'Asset Tag', key: 'asset_tag' },
          { header: 'Asset Name', key: 'name' },
          { header: 'Category', key: 'category' },
          { header: 'Manufacturer', key: 'manufacturer' },
          { header: 'Model', key: 'model' },
          { header: 'Serial Number', key: 'serial_number' },
          { header: 'Employee Code', key: 'employee_code' },
          { header: 'Employee Name', key: 'employee_name' },
          { header: 'Department', key: 'department' },
          { header: 'Designation', key: 'designation' },
          { header: 'Employee Email', key: 'employee_email' }
        ]);
      }

      case 'assignment_history': {
        const data = await this.getAssignmentHistoryReport();
        return arrayToCsv(data, [
          { header: 'History ID', key: 'history_id' },
          { header: 'Asset Tag', key: 'asset_tag' },
          { header: 'Asset Name', key: 'asset_name' },
          { header: 'Category', key: 'category' },
          { header: 'Employee Code', key: 'employee_code' },
          { header: 'Employee Name', key: 'employee_name' },
          { header: 'Department', key: 'department' },
          { header: 'Action', key: 'action' },
          { header: 'Action Date', key: 'action_date' },
          { header: 'Performed By', key: 'performed_by' },
          { header: 'Notes', key: 'notes' }
        ]);
      }

      case 'license_inventory': {
        const data = await this.getLicenseInventoryReport(filters);
        return arrayToCsv(data, [
          { header: 'License Code', key: 'license_code' },
          { header: 'Software Name', key: 'software_name' },
          { header: 'Vendor', key: 'vendor' },
          { header: 'License Type', key: 'license_type' },
          { header: 'Total Seats', key: 'total_quantity' },
          { header: 'Used Seats', key: 'used_quantity' },
          { header: 'Available Seats', key: 'available_quantity' },
          { header: 'Purchase Date', key: 'purchase_date' },
          { header: 'Expiry Date', key: 'expiry_date' },
          { header: 'Purchase Cost', key: 'purchase_cost' },
          { header: 'Renewal Status', key: 'renewal_status' },
          { header: 'Notes', key: 'notes' }
        ]);
      }

      case 'seat_utilization': {
        const data = await this.getSeatUtilizationReport();
        return arrayToCsv(data, [
          { header: 'License Code', key: 'license_code' },
          { header: 'Software Name', key: 'software_name' },
          { header: 'Vendor', key: 'vendor' },
          { header: 'License Type', key: 'license_type' },
          { header: 'Total Seats', key: 'total_quantity' },
          { header: 'Used Seats', key: 'used_quantity' },
          { header: 'Available Seats', key: 'available_quantity' },
          { header: 'Utilization %', key: 'utilization_percent' },
          { header: 'Expiry Date', key: 'expiry_date' },
          { header: 'Renewal Status', key: 'renewal_status' }
        ]);
      }

      case 'expired_licenses': {
        const result = await expiryService.getLicenseExpiry({ bucket: 'EXPIRED' });
        return arrayToCsv(result.licenses, [
          { header: 'License Code', key: 'license_code' },
          { header: 'Software Name', key: 'software_name' },
          { header: 'Vendor', key: 'vendor' },
          { header: 'License Type', key: 'license_type' },
          { header: 'Expiry Date', key: 'expiry_date' },
          { header: 'Days Overdue', key: 'days_remaining' },
          { header: 'Renewal Status', key: 'renewal_status' },
          { header: 'Total Seats', key: 'total_quantity' },
          { header: 'Used Seats', key: 'used_quantity' }
        ]);
      }

      case 'expiring_licenses': {
        const result = await expiryService.getLicenseExpiry();
        const expiring = result.licenses.filter(l =>
          l.expiry_bucket === 'EXPIRING_7_DAYS' || l.expiry_bucket === 'EXPIRING_30_DAYS'
        );
        return arrayToCsv(expiring, [
          { header: 'License Code', key: 'license_code' },
          { header: 'Software Name', key: 'software_name' },
          { header: 'Vendor', key: 'vendor' },
          { header: 'Expiry Date', key: 'expiry_date' },
          { header: 'Days Remaining', key: 'days_remaining' },
          { header: 'Expiry Bucket', key: 'expiry_bucket' },
          { header: 'Renewal Status', key: 'renewal_status' },
          { header: 'Total Seats', key: 'total_quantity' },
          { header: 'Used Seats', key: 'used_quantity' }
        ]);
      }

      default: {
        const err = new Error(`Unknown report type '${reportType}'.`);
        err.statusCode = 400;
        throw err;
      }
    }
  }
}

module.exports = { ReportService: new ReportService(), sanitizeCsvCell, arrayToCsv };
