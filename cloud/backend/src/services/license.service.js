const db = require('../config/database');
const licenseRepository = require('../repositories/license.repository');
const allocationRepository = require('../repositories/allocation.repository');
const employeeRepository = require('../repositories/employee.repository');
const assetRepository = require('../repositories/asset.repository');
const auditRepository = require('../repositories/audit.repository');

const VALID_LICENSE_TYPES = [
  'PERPETUAL',
  'ANNUAL_SUBSCRIPTION',
  'MONTHLY_SUBSCRIPTION',
  'VOLUME_SEAT',
  'OEM'
];

const VALID_RENEWAL_STATUSES = [
  'ACTIVE',
  'EXPIRING_SOON',
  'EXPIRED',
  'CANCELLED'
];

class LicenseService {
  /**
   * Retrieves paginated software licenses with search and filters.
   */
  async getAllLicenses(options = {}) {
    return await licenseRepository.findAll(options);
  }

  /**
   * Retrieves a single license by ID.
   */
  async getLicenseById(id) {
    const license = await licenseRepository.findById(id);
    if (!license) {
      const err = new Error(`Software license with ID ${id} was not found.`);
      err.statusCode = 404;
      throw err;
    }
    return license;
  }

  /**
   * Validates license payload.
   */
  validatePayload(data, isUpdate = false) {
    const {
      license_code,
      software_name,
      vendor,
      license_type,
      total_quantity,
      purchase_date,
      expiry_date,
      purchase_cost,
      renewal_status
    } = data;

    if (!isUpdate || license_code !== undefined) {
      if (!license_code || !license_code.trim()) {
        const err = new Error('License code / identifier is required.');
        err.statusCode = 400;
        throw err;
      }
    }

    if (!isUpdate || software_name !== undefined) {
      if (!software_name || !software_name.trim()) {
        const err = new Error('Software name is required.');
        err.statusCode = 400;
        throw err;
      }
    }

    if (!isUpdate || vendor !== undefined) {
      if (!vendor || !vendor.trim()) {
        const err = new Error('Vendor is required.');
        err.statusCode = 400;
        throw err;
      }
    }

    if (!isUpdate || license_type !== undefined) {
      if (!license_type || !license_type.trim()) {
        const err = new Error('License type is required.');
        err.statusCode = 400;
        throw err;
      }
      if (!VALID_LICENSE_TYPES.includes(license_type.trim().toUpperCase())) {
        const err = new Error(
          `Invalid license type '${license_type}'. Must be one of: ${VALID_LICENSE_TYPES.join(', ')}.`
        );
        err.statusCode = 400;
        throw err;
      }
    }

    if (!isUpdate || total_quantity !== undefined) {
      if (total_quantity === undefined || total_quantity === null || total_quantity === '') {
        const err = new Error('Total seat quantity is required.');
        err.statusCode = 400;
        throw err;
      }
      const qty = Number(total_quantity);
      if (!Number.isInteger(qty) || qty <= 0) {
        const err = new Error('Total seat quantity must be a positive integer greater than 0.');
        err.statusCode = 400;
        throw err;
      }
    }

    if (!isUpdate || purchase_date !== undefined) {
      if (!purchase_date || !purchase_date.trim()) {
        const err = new Error('Purchase date is required.');
        err.statusCode = 400;
        throw err;
      }
      if (isNaN(Date.parse(purchase_date))) {
        const err = new Error('Invalid purchase date format. Use YYYY-MM-DD.');
        err.statusCode = 400;
        throw err;
      }
    }

    if (expiry_date && expiry_date.trim()) {
      if (isNaN(Date.parse(expiry_date))) {
        const err = new Error('Invalid expiry date format. Use YYYY-MM-DD.');
        err.statusCode = 400;
        throw err;
      }
    }

    if (purchase_cost !== undefined && purchase_cost !== null && purchase_cost !== '') {
      const cost = Number(purchase_cost);
      if (isNaN(cost) || cost < 0) {
        const err = new Error('Purchase cost must be a non-negative number.');
        err.statusCode = 400;
        throw err;
      }
    }

    if (renewal_status !== undefined && renewal_status !== null && renewal_status !== '') {
      if (!VALID_RENEWAL_STATUSES.includes(renewal_status.trim().toUpperCase())) {
        const err = new Error(
          `Invalid renewal status '${renewal_status}'. Must be one of: ${VALID_RENEWAL_STATUSES.join(', ')}.`
        );
        err.statusCode = 400;
        throw err;
      }
    }
  }

  /**
   * Registers a new software license.
   */
  async createLicense(data, adminId = null) {
    this.validatePayload(data, false);

    const licenseCode = data.license_code.trim();

    // Enforce unique license code
    const existing = await licenseRepository.findByCode(licenseCode);
    if (existing) {
      const err = new Error(`A software license with code '${licenseCode}' already exists.`);
      err.statusCode = 409;
      throw err;
    }

    const payload = {
      license_code: licenseCode,
      software_name: data.software_name.trim(),
      vendor: data.vendor.trim(),
      license_type: data.license_type.trim().toUpperCase(),
      total_quantity: Number(data.total_quantity),
      used_quantity: 0,
      purchase_date: data.purchase_date.trim(),
      expiry_date: data.expiry_date && data.expiry_date.trim() ? data.expiry_date.trim() : null,
      purchase_cost: data.purchase_cost !== undefined && data.purchase_cost !== null && data.purchase_cost !== ''
        ? Number(data.purchase_cost)
        : 0.00,
      renewal_status: data.renewal_status && data.renewal_status.trim()
        ? data.renewal_status.trim().toUpperCase()
        : 'ACTIVE',
      notes: data.notes && data.notes.trim() ? data.notes.trim() : null
    };

    const license = await licenseRepository.create(payload);

    // Audit log
    await auditRepository.log({
      adminId,
      action: 'LICENSE_CREATED',
      entityType: 'LICENSE',
      entityId: license.id,
      details: {
        license_code: license.license_code,
        software_name: license.software_name,
        total_quantity: license.total_quantity
      }
    });

    return license;
  }

  /**
   * Updates an existing software license's metadata.
   */
  async updateLicense(id, data, adminId = null) {
    const existing = await this.getLicenseById(id);
    this.validatePayload(data, true);

    const updatedLicenseCode = data.license_code !== undefined
      ? data.license_code.trim()
      : existing.license_code;

    // Enforce uniqueness if code changed
    if (updatedLicenseCode.toLowerCase() !== existing.license_code.toLowerCase()) {
      const duplicate = await licenseRepository.findByCode(updatedLicenseCode);
      if (duplicate && duplicate.id !== Number(id)) {
        const err = new Error(`A software license with code '${updatedLicenseCode}' already exists.`);
        err.statusCode = 409;
        throw err;
      }
    }

    // Invariant: purchased total_quantity cannot be reduced below active allocation count
    if (data.total_quantity !== undefined) {
      const newTotal = Number(data.total_quantity);
      if (newTotal < existing.used_quantity) {
        const err = new Error(
          `Cannot reduce purchased seats (${newTotal}) below current active allocations (${existing.used_quantity}). Revoke active seat allocations first.`
        );
        err.statusCode = 409;
        throw err;
      }
    }

    const payload = {
      license_code: updatedLicenseCode,
      software_name: data.software_name !== undefined ? data.software_name.trim() : existing.software_name,
      vendor: data.vendor !== undefined ? data.vendor.trim() : existing.vendor,
      license_type: data.license_type !== undefined ? data.license_type.trim().toUpperCase() : existing.license_type,
      total_quantity: data.total_quantity !== undefined ? Number(data.total_quantity) : existing.total_quantity,
      purchase_date: data.purchase_date !== undefined ? data.purchase_date.trim() : existing.purchase_date,
      expiry_date: data.expiry_date !== undefined
        ? (data.expiry_date && data.expiry_date.trim() ? data.expiry_date.trim() : null)
        : existing.expiry_date,
      purchase_cost: data.purchase_cost !== undefined
        ? (data.purchase_cost !== null && data.purchase_cost !== '' ? Number(data.purchase_cost) : 0.00)
        : existing.purchase_cost,
      renewal_status: data.renewal_status !== undefined
        ? data.renewal_status.trim().toUpperCase()
        : existing.renewal_status,
      notes: data.notes !== undefined
        ? (data.notes && data.notes.trim() ? data.notes.trim() : null)
        : existing.notes
    };

    const updated = await licenseRepository.update(id, payload);

    await auditRepository.log({
      adminId,
      action: 'LICENSE_UPDATED',
      entityType: 'LICENSE',
      entityId: id,
      details: {
        license_code: updated.license_code,
        software_name: updated.software_name,
        total_quantity: updated.total_quantity,
        renewal_status: updated.renewal_status
      }
    });

    return updated;
  }

  /**
   * Safely deletes a license (rejected if allocations exist).
   */
  async deleteLicense(id, adminId = null) {
    const existing = await this.getLicenseById(id);

    // Prevent deletion if allocations exist
    const hasAllocations = await licenseRepository.hasAllocations(id);
    if (hasAllocations) {
      const err = new Error(
        `Cannot delete license '${existing.software_name}' (${existing.license_code}) because historical or active allocation records exist. To preserve compliance audit history, update the license renewal status to CANCELLED instead.`
      );
      err.statusCode = 409;
      throw err;
    }

    await licenseRepository.delete(id);

    await auditRepository.log({
      adminId,
      action: 'LICENSE_DELETED',
      entityType: 'LICENSE',
      entityId: id,
      details: {
        license_code: existing.license_code,
        software_name: existing.software_name
      }
    });

    return {
      success: true,
      message: `Software license '${existing.software_name}' (${existing.license_code}) was safely deleted.`
    };
  }

  /**
   * Retrieves all allocations for a given license.
   */
  async getAllocationsByLicense(licenseId) {
    await this.getLicenseById(licenseId);
    return await allocationRepository.findByLicenseId(licenseId);
  }

  /**
   * Allocates a license seat to an employee (or hardware asset) inside an atomic transaction.
   */
  async allocateSeat(licenseId, { employee_id = null, asset_id = null, notes = null }, adminId = null) {
    if (!employee_id && !asset_id) {
      const err = new Error('Either an employee ID or asset ID must be specified for allocation.');
      err.statusCode = 400;
      throw err;
    }

    // 1. Verify license exists
    const license = await this.getLicenseById(licenseId);

    // 2. Verify license renewal status allows allocations
    if (license.renewal_status === 'EXPIRED' || license.renewal_status === 'CANCELLED') {
      const err = new Error(
        `Cannot allocate seats for license '${license.software_name}' because its renewal status is '${license.renewal_status}'.`
      );
      err.statusCode = 409;
      throw err;
    }

    // 3. Verify seat capacity
    if (license.used_quantity >= license.total_quantity) {
      const err = new Error(
        `No available seats remaining for license '${license.software_name}' (${license.used_quantity}/${license.total_quantity} seats allocated).`
      );
      err.statusCode = 409;
      throw err;
    }

    let employee = null;
    if (employee_id) {
      employee = await employeeRepository.findById(employee_id);
      if (!employee) {
        const err = new Error(`Employee with ID ${employee_id} was not found.`);
        err.statusCode = 404;
        throw err;
      }

      if (employee.status !== 'ACTIVE') {
        const err = new Error(
          `Cannot allocate license to employee '${employee.first_name} ${employee.last_name}' because their employment status is '${employee.status}'. Only ACTIVE employees can be allocated licenses.`
        );
        err.statusCode = 409;
        throw err;
      }

      // Check for duplicate active allocation for the same employee/license
      const existingActive = await allocationRepository.findActiveByLicenseAndEmployee(licenseId, employee_id);
      if (existingActive) {
        const err = new Error(
          `Employee '${employee.first_name} ${employee.last_name}' (${employee.employee_code}) already holds an active seat allocation for this license.`
        );
        err.statusCode = 409;
        throw err;
      }
    }

    let asset = null;
    if (asset_id) {
      asset = await assetRepository.findById(asset_id);
      if (!asset) {
        const err = new Error(`Hardware asset with ID ${asset_id} was not found.`);
        err.statusCode = 404;
        throw err;
      }
    }

    let newAllocation = null;

    // 4. Atomic transaction: update used_quantity, insert allocation, record audit log
    await db.transaction(async ({ run }) => {
      // Conditional update ensures zero race conditions if concurrent allocations arrive
      const updateResult = await run(
        `UPDATE software_licenses
         SET used_quantity = used_quantity + 1,
             updated_at = DATETIME('now')
         WHERE id = ? AND used_quantity < total_quantity`,
        [licenseId]
      );

      if (updateResult.changes !== 1) {
        const err = new Error(
          `Seat capacity exceeded or concurrent allocation conflict for license '${license.software_name}'.`
        );
        err.statusCode = 409;
        throw err;
      }

      // Insert allocation record
      const insertResult = await run(
        `INSERT INTO license_allocations (
           license_id, employee_id, asset_id, allocated_at, revoked_at, notes
         ) VALUES (?, ?, ?, DATETIME('now'), NULL, ?)`,
        [
          licenseId,
          employee_id || null,
          asset_id || null,
          notes && notes.trim() ? notes.trim() : null
        ]
      );

      const allocationId = insertResult.lastID;

      // Record audit log inside transaction
      await run(
        `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, details)
         VALUES (?, 'LICENSE_ALLOCATED', 'LICENSE', ?, ?)`,
        [
          adminId,
          licenseId,
          JSON.stringify({
            allocation_id: allocationId,
            license_code: license.license_code,
            employee_id: employee_id || null,
            employee_code: employee ? employee.employee_code : null,
            asset_id: asset_id || null,
            asset_tag: asset ? asset.asset_tag : null
          })
        ]
      );

      newAllocation = await allocationRepository.findById(allocationId);
    });

    const updatedLicense = await licenseRepository.findById(licenseId);

    return {
      success: true,
      allocation: newAllocation,
      license: updatedLicense
    };
  }

  /**
   * Revokes an active allocation inside an atomic transaction.
   */
  async revokeAllocation(licenseId, allocationId, adminId = null) {
    // 1. Verify license exists
    const license = await this.getLicenseById(licenseId);

    // 2. Verify allocation exists and belongs to this license
    const allocation = await allocationRepository.findById(allocationId);
    if (!allocation || allocation.license_id !== Number(licenseId)) {
      const err = new Error(
        `Allocation record with ID ${allocationId} does not belong to license ID ${licenseId}.`
      );
      err.statusCode = 404;
      throw err;
    }

    // 3. Verify allocation is currently active
    if (allocation.revoked_at !== null) {
      const err = new Error(
        `Allocation ID ${allocationId} has already been revoked on ${new Date(allocation.revoked_at).toLocaleString()}.`
      );
      err.statusCode = 409;
      throw err;
    }

    // 4. Atomic transaction: mark allocation revoked, decrement used_quantity, append audit
    await db.transaction(async ({ run }) => {
      // Conditional update ensures zero duplicate revocations
      const revokeResult = await run(
        `UPDATE license_allocations
         SET revoked_at = DATETIME('now')
         WHERE id = ? AND license_id = ? AND revoked_at IS NULL`,
        [allocationId, licenseId]
      );

      if (revokeResult.changes !== 1) {
        const err = new Error(
          `Allocation ID ${allocationId} was already revoked or conflict occurred.`
        );
        err.statusCode = 409;
        throw err;
      }

      // Decrement used_quantity
      const updateResult = await run(
        `UPDATE software_licenses
         SET used_quantity = used_quantity - 1,
             updated_at = DATETIME('now')
         WHERE id = ? AND used_quantity > 0`,
        [licenseId]
      );

      if (updateResult.changes !== 1) {
        const err = new Error('Failed to synchronize license used seat quantity during revocation.');
        err.statusCode = 500;
        throw err;
      }

      // Append audit log
      await run(
        `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, details)
         VALUES (?, 'LICENSE_REVOKED', 'LICENSE', ?, ?)`,
        [
          adminId,
          licenseId,
          JSON.stringify({
            allocation_id: allocationId,
            license_code: license.license_code,
            employee_id: allocation.employee_id,
            employee_code: allocation.employee_code
          })
        ]
      );
    });

    const updatedLicense = await licenseRepository.findById(licenseId);

    return {
      success: true,
      message: 'License seat allocation was successfully revoked.',
      license: updatedLicense
    };
  }
}

module.exports = new LicenseService();
