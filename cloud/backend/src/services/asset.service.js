const db = require('../config/database');
const assetRepository = require('../repositories/asset.repository');
const employeeRepository = require('../repositories/employee.repository');
const assignmentHistoryRepository = require('../repositories/assignmentHistory.repository');
const auditRepository = require('../repositories/audit.repository');

const VALID_CATEGORIES = ['LAPTOP', 'DESKTOP', 'MONITOR', 'PRINTER', 'NETWORKING', 'MOBILE', 'OTHER'];
const VALID_STATUSES = ['AVAILABLE', 'ASSIGNED', 'UNDER_MAINTENANCE', 'RETIRED'];

class AssetService {
  /**
   * Retrieves paginated assets with search and filters.
   */
  async getAllAssets(options = {}) {
    return await assetRepository.findAll(options);
  }

  /**
   * Retrieves single asset by ID.
   */
  async getAssetById(id) {
    const asset = await assetRepository.findById(id);
    if (!asset) {
      const err = new Error(`Asset with ID ${id} was not found.`);
      err.statusCode = 404;
      throw err;
    }
    return asset;
  }

  /**
   * Validates asset payload.
   */
  validatePayload(data, isUpdate = false) {
    const { asset_tag, name, category, manufacturer, model, purchase_date, purchase_cost, warranty_expiry, status } = data;

    if (!isUpdate || asset_tag !== undefined) {
      if (!asset_tag || !asset_tag.trim()) {
        const err = new Error('Asset tag is required.');
        err.statusCode = 400;
        throw err;
      }
    }

    if (!isUpdate || name !== undefined) {
      if (!name || !name.trim()) {
        const err = new Error('Asset name is required.');
        err.statusCode = 400;
        throw err;
      }
    }

    if (!isUpdate || category !== undefined) {
      if (!category || !category.trim()) {
        const err = new Error('Asset category is required.');
        err.statusCode = 400;
        throw err;
      }
      if (!VALID_CATEGORIES.includes(category.trim().toUpperCase())) {
        const err = new Error(`Invalid category '${category}'. Must be one of: ${VALID_CATEGORIES.join(', ')}.`);
        err.statusCode = 400;
        throw err;
      }
    }

    if (!isUpdate || manufacturer !== undefined) {
      if (!manufacturer || !manufacturer.trim()) {
        const err = new Error('Manufacturer is required.');
        err.statusCode = 400;
        throw err;
      }
    }

    if (!isUpdate || model !== undefined) {
      if (!model || !model.trim()) {
        const err = new Error('Model is required.');
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
        const err = new Error('Purchase date must be a valid date.');
        err.statusCode = 400;
        throw err;
      }
    }

    if (purchase_cost !== undefined && purchase_cost !== null) {
      const cost = Number(purchase_cost);
      if (isNaN(cost) || cost < 0) {
        const err = new Error('Purchase cost must be a non-negative number.');
        err.statusCode = 400;
        throw err;
      }
    }

    if (warranty_expiry) {
      if (isNaN(Date.parse(warranty_expiry))) {
        const err = new Error('Warranty expiry date must be a valid date.');
        err.statusCode = 400;
        throw err;
      }
    }

    if (status !== undefined && status !== null) {
      if (!VALID_STATUSES.includes(status)) {
        const err = new Error(`Invalid status '${status}'. Must be one of: ${VALID_STATUSES.join(', ')}.`);
        err.statusCode = 400;
        throw err;
      }
    }
  }

  /**
   * Creates a new asset in AVAILABLE status.
   */
  async createAsset(data, adminId = null) {
    this.validatePayload(data, false);

    const tag = data.asset_tag.trim();
    const serial = data.serial_number && data.serial_number.trim() ? data.serial_number.trim() : null;

    // Check unique tag
    const existingTag = await assetRepository.findByTag(tag);
    if (existingTag) {
      const err = new Error(`Asset tag '${tag}' already exists.`);
      err.statusCode = 409;
      throw err;
    }

    // Check unique serial number if supplied
    if (serial) {
      const existingSerial = await assetRepository.findBySerial(serial);
      if (existingSerial) {
        const err = new Error(`Serial number '${serial}' is already registered to another asset.`);
        err.statusCode = 409;
        throw err;
      }
    }

    const newAsset = await assetRepository.create({
      assetTag: tag,
      serialNumber: serial,
      name: data.name.trim(),
      category: data.category.trim().toUpperCase(),
      manufacturer: data.manufacturer.trim(),
      model: data.model.trim(),
      purchaseDate: data.purchase_date.trim(),
      purchaseCost: data.purchase_cost !== undefined ? Number(data.purchase_cost) : 0.0,
      warrantyExpiry: data.warranty_expiry && data.warranty_expiry.trim() ? data.warranty_expiry.trim() : null,
      notes: data.notes && data.notes.trim() ? data.notes.trim() : null,
      billImageUrl: data.bill_image_url && data.bill_image_url.trim() ? data.bill_image_url.trim() : null,
      billImageName: data.bill_image_name && data.bill_image_name.trim() ? data.bill_image_name.trim() : null
    });

    // Record audit log
    await auditRepository.log({
      adminId,
      action: 'ASSET_CREATED',
      entityType: 'ASSET',
      entityId: newAsset.id,
      details: {
        asset_tag: newAsset.asset_tag,
        category: newAsset.category,
        status: newAsset.status,
        has_bill: !!newAsset.bill_image_url
      }
    });

    return newAsset;
  }

  /**
   * Updates asset metadata. Enforces that assignment state cannot be modified via general edits.
   */
  async updateAsset(id, data, adminId = null) {
    const existing = await assetRepository.findById(id);
    if (!existing) {
      const err = new Error(`Asset with ID ${id} was not found.`);
      err.statusCode = 404;
      throw err;
    }

    this.validatePayload(data, true);

    // Safeguard: General update must NOT alter assignment custody
    if (data.current_employee_id !== undefined && data.current_employee_id !== existing.current_employee_id) {
      const err = new Error('Employee assignment cannot be altered through general asset edits. Use the dedicated /assign and /return endpoints.');
      err.statusCode = 409;
      throw err;
    }

    // Safeguard: Assigned assets cannot have status changed through general edit
    if (existing.status === 'ASSIGNED' && data.status && data.status !== 'ASSIGNED') {
      const err = new Error(`Asset '${existing.asset_tag}' is currently assigned to an employee. You must return the asset before modifying its lifecycle status.`);
      err.statusCode = 409;
      throw err;
    }

    // Safeguard: Cannot set status to ASSIGNED through general edit
    if (existing.status !== 'ASSIGNED' && data.status === 'ASSIGNED') {
      const err = new Error('Assets cannot be directly marked as ASSIGNED. Use the dedicated /assign endpoint to establish custody.');
      err.statusCode = 409;
      throw err;
    }

    const updatedTag = data.asset_tag ? data.asset_tag.trim() : existing.asset_tag;
    const updatedSerial = data.serial_number !== undefined
      ? (data.serial_number && data.serial_number.trim() ? data.serial_number.trim() : null)
      : existing.serial_number;

    // Check tag collision
    if (updatedTag !== existing.asset_tag) {
      const collision = await assetRepository.findByTag(updatedTag);
      if (collision && collision.id !== Number(id)) {
        const err = new Error(`Asset tag '${updatedTag}' is already in use by another asset.`);
        err.statusCode = 409;
        throw err;
      }
    }

    // Check serial collision
    if (updatedSerial && updatedSerial !== existing.serial_number) {
      const collision = await assetRepository.findBySerial(updatedSerial);
      if (collision && collision.id !== Number(id)) {
        const err = new Error(`Serial number '${updatedSerial}' is already in use by another asset.`);
        err.statusCode = 409;
        throw err;
      }
    }

    // Update metadata
    const updated = await assetRepository.update(id, {
      assetTag: updatedTag,
      serialNumber: updatedSerial,
      name: data.name ? data.name.trim() : existing.name,
      category: data.category ? data.category.trim().toUpperCase() : existing.category,
      manufacturer: data.manufacturer ? data.manufacturer.trim() : existing.manufacturer,
      model: data.model ? data.model.trim() : existing.model,
      purchaseDate: data.purchase_date ? data.purchase_date.trim() : existing.purchase_date,
      purchaseCost: data.purchase_cost !== undefined ? Number(data.purchase_cost) : existing.purchase_cost,
      warrantyExpiry: data.warranty_expiry !== undefined
        ? (data.warranty_expiry && data.warranty_expiry.trim() ? data.warranty_expiry.trim() : null)
        : existing.warranty_expiry,
      notes: data.notes !== undefined
        ? (data.notes && data.notes.trim() ? data.notes.trim() : null)
        : existing.notes,
      billImageUrl: data.bill_image_url !== undefined
        ? (data.bill_image_url && data.bill_image_url.trim() ? data.bill_image_url.trim() : null)
        : undefined,
      billImageName: data.bill_image_name !== undefined
        ? (data.bill_image_name && data.bill_image_name.trim() ? data.bill_image_name.trim() : null)
        : undefined
    });

    // If unassigned asset status changed (e.g. AVAILABLE <-> UNDER_MAINTENANCE <-> RETIRED)
    if (existing.status !== 'ASSIGNED' && data.status && data.status !== existing.status) {
      await assetRepository.updateStatus(id, data.status);
      updated.status = data.status;

      // Log maintenance/retirement in assignment history for traceability
      if (data.status === 'UNDER_MAINTENANCE') {
        await assignmentHistoryRepository.create({
          assetId: id,
          action: 'SENT_TO_MAINTENANCE',
          performedByAdminId: adminId,
          notes: data.notes || 'Sent to maintenance'
        });
      } else if (data.status === 'RETIRED') {
        await assignmentHistoryRepository.create({
          assetId: id,
          action: 'RETIRED',
          performedByAdminId: adminId,
          notes: data.notes || 'Decommissioned / Retired'
        });
      } else if (data.status === 'AVAILABLE' && existing.status === 'UNDER_MAINTENANCE') {
        await assignmentHistoryRepository.create({
          assetId: id,
          action: 'RETURNED_FROM_MAINTENANCE',
          performedByAdminId: adminId,
          notes: data.notes || 'Returned from maintenance'
        });
      }
    }

    // Record audit log
    await auditRepository.log({
      adminId,
      action: 'ASSET_UPDATED',
      entityType: 'ASSET',
      entityId: id,
      details: {
        asset_tag: updated.asset_tag,
        status: updated.status
      }
    });

    return await assetRepository.findById(id);
  }

  /**
   * Assigns an available hardware asset to an active employee.
   * Executes inside an atomic transaction.
   */
  async assignAsset(assetId, employeeId, adminId = null, notes = null) {
    if (!employeeId) {
      const err = new Error('Employee ID is required for assignment.');
      err.statusCode = 400;
      throw err;
    }

    // 1. Verify asset exists
    const asset = await assetRepository.findById(assetId);
    if (!asset) {
      const err = new Error(`Asset with ID ${assetId} was not found.`);
      err.statusCode = 404;
      throw err;
    }

    // 2. Verify asset is eligible for assignment
    if (asset.status === 'ASSIGNED') {
      const err = new Error(
        `Asset '${asset.asset_tag}' is already assigned to employee ID ${asset.current_employee_id} (${asset.current_employee_name || 'Assigned'}).`
      );
      err.statusCode = 409;
      throw err;
    }

    if (asset.status === 'UNDER_MAINTENANCE') {
      const err = new Error(`Asset '${asset.asset_tag}' is currently UNDER_MAINTENANCE and cannot be assigned.`);
      err.statusCode = 409;
      throw err;
    }

    if (asset.status === 'RETIRED') {
      const err = new Error(`Asset '${asset.asset_tag}' has been RETIRED and cannot be assigned.`);
      err.statusCode = 409;
      throw err;
    }

    if (asset.status !== 'AVAILABLE') {
      const err = new Error(`Asset '${asset.asset_tag}' is not available for assignment (status: ${asset.status}).`);
      err.statusCode = 409;
      throw err;
    }

    // 3. Verify employee exists and is active
    const employee = await employeeRepository.findById(employeeId);
    if (!employee) {
      const err = new Error(`Employee with ID ${employeeId} was not found.`);
      err.statusCode = 404;
      throw err;
    }

    if (employee.status !== 'ACTIVE') {
      const err = new Error(
        `Cannot assign asset to employee '${employee.first_name} ${employee.last_name}' because their employment status is '${employee.status}'. Only ACTIVE employees can hold assets.`
      );
      err.statusCode = 409;
      throw err;
    }

    // 4. Atomic Transaction: Update asset, insert history, and record audit
    await db.transaction(async ({ run }) => {
      // Conditional update ensures zero race conditions if concurrent assign requests arrive
      const updateResult = await run(
        `UPDATE assets
         SET status = 'ASSIGNED',
             current_employee_id = ?,
             updated_at = DATETIME('now')
         WHERE id = ? AND status = 'AVAILABLE' AND current_employee_id IS NULL`,
        [employeeId, assetId]
      );

      if (updateResult.changes !== 1) {
        const err = new Error(`Concurrent modification conflict: Asset '${asset.asset_tag}' is no longer available.`);
        err.statusCode = 409;
        throw err;
      }

      // Record immutable assignment history
      await run(
        `INSERT INTO asset_assignment_history (
           asset_id, employee_id, action, action_date, performed_by_admin_id, notes
         ) VALUES (?, ?, 'ASSIGNED', DATETIME('now'), ?, ?)`,
        [assetId, employeeId, adminId, notes && notes.trim() ? notes.trim() : 'Asset assigned']
      );

      // Record audit log inside transaction
      await run(
        `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, details)
         VALUES (?, 'ASSET_ASSIGNED', 'ASSET', ?, ?)`,
        [
          adminId,
          assetId,
          JSON.stringify({
            asset_tag: asset.asset_tag,
            employee_id: employeeId,
            employee_code: employee.employee_code,
            employee_name: `${employee.first_name} ${employee.last_name}`
          })
        ]
      );
    });

    return await assetRepository.findById(assetId);
  }

  /**
   * Returns an assigned hardware asset back to AVAILABLE inventory.
   * Executes inside an atomic transaction.
   */
  async returnAsset(assetId, adminId = null, notes = null) {
    // 1. Verify asset exists
    const asset = await assetRepository.findById(assetId);
    if (!asset) {
      const err = new Error(`Asset with ID ${assetId} was not found.`);
      err.statusCode = 404;
      throw err;
    }

    // 2. Verify asset is currently assigned
    if (asset.status !== 'ASSIGNED' || !asset.current_employee_id) {
      const err = new Error(`Asset '${asset.asset_tag}' is not currently assigned (current status: ${asset.status}).`);
      err.statusCode = 409;
      throw err;
    }

    const previousEmployeeId = asset.current_employee_id;
    const previousEmployeeName = asset.current_employee_name;

    // 3. Atomic Transaction: Update asset, append return history, and record audit
    await db.transaction(async ({ run }) => {
      const updateResult = await run(
        `UPDATE assets
         SET status = 'AVAILABLE',
             current_employee_id = NULL,
             updated_at = DATETIME('now')
         WHERE id = ? AND status = 'ASSIGNED'`,
        [assetId]
      );

      if (updateResult.changes !== 1) {
        const err = new Error(`Concurrent modification conflict: Asset '${asset.asset_tag}' is no longer in ASSIGNED status.`);
        err.statusCode = 409;
        throw err;
      }

      // Record return action in immutable history
      await run(
        `INSERT INTO asset_assignment_history (
           asset_id, employee_id, action, action_date, performed_by_admin_id, notes
         ) VALUES (?, ?, 'RETURNED', DATETIME('now'), ?, ?)`,
        [assetId, previousEmployeeId, adminId, notes && notes.trim() ? notes.trim() : 'Asset returned to inventory']
      );

      // Record audit log
      await run(
        `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, details)
         VALUES (?, 'ASSET_RETURNED', 'ASSET', ?, ?)`,
        [
          adminId,
          assetId,
          JSON.stringify({
            asset_tag: asset.asset_tag,
            previous_employee_id: previousEmployeeId,
            previous_employee_name: previousEmployeeName
          })
        ]
      );
    });

    return await assetRepository.findById(assetId);
  }

  /**
   * Retrieves chronological assignment history for an asset.
   */
  async getAssetHistory(assetId) {
    const asset = await assetRepository.findById(assetId);
    if (!asset) {
      const err = new Error(`Asset with ID ${assetId} was not found.`);
      err.statusCode = 404;
      throw err;
    }

    return await assignmentHistoryRepository.findByAssetId(assetId);
  }

  /**
   * Safely deletes an asset or rejects if assigned or historical references exist.
   */
  async deleteAsset(id, adminId = null) {
    const asset = await assetRepository.findById(id);
    if (!asset) {
      const err = new Error(`Asset with ID ${id} was not found.`);
      err.statusCode = 404;
      throw err;
    }

    if (asset.status === 'ASSIGNED') {
      const err = new Error(
        `Cannot delete asset '${asset.asset_tag}' because it is currently assigned to employee '${asset.current_employee_name || asset.current_employee_id}'. Please return the asset first.`
      );
      err.statusCode = 409;
      throw err;
    }

    const { historyCount, allocationsCount } = await assetRepository.getHistoricalReferences(id);
    if (historyCount > 0 || allocationsCount > 0) {
      const err = new Error(
        `Cannot delete asset '${asset.asset_tag}' with existing assignment history (${historyCount} record(s)) to preserve audit integrity. You can set its status to 'RETIRED' instead.`
      );
      err.statusCode = 409;
      throw err;
    }

    await assetRepository.delete(id);

    // Record audit log
    await auditRepository.log({
      adminId,
      action: 'ASSET_DELETED',
      entityType: 'ASSET',
      entityId: id,
      details: {
        asset_tag: asset.asset_tag,
        name: asset.name
      }
    });

    return { id: Number(id), deleted: true };
  }
}

module.exports = new AssetService();
