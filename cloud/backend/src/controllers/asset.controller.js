const path = require('path');
const assetService = require('../services/asset.service');
const storageService = require('../services/storage.service');
const db = require('../config/database');

/**
 * Controller handling hardware asset inventory and assignment lifecycle endpoints.
 */
class AssetController {
  /**
   * Uploads asset bill / invoice image via pluggable storage provider (Amazon S3 or local).
   */
  async uploadBill(req, res, next) {
    try {
      const { image, fileName } = req.body;
      if (!image) {
        return res.status(400).json({
          success: false,
          error: 'Bill image data is required.'
        });
      }

      const result = await storageService.uploadBillImage({
        base64Data: image,
        fileName: fileName || 'asset_bill.jpg'
      });

      // Keep searchable upload metadata in RDS/PostgreSQL; file bytes remain in S3.
      try {
        await db.run(
          'INSERT INTO bill_uploads (object_key, original_filename, mime_type, size_bytes, storage_provider) VALUES (?, ?, ?, ?, ?)',
          [result.objectName, result.originalName, result.mimeType, result.sizeBytes, result.provider]
        );
      } catch (metadataError) {
        // Avoid an orphaned cloud object if the metadata write fails.
        try { await storageService.deleteBillImage(result.objectName); } catch { /* best effort cleanup */ }
        throw metadataError;
      }

      return res.status(200).json({
        success: true,
        message: 'Bill uploaded successfully.',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Streams a private stored bill image securely through authorized API endpoint.
   * Prevents directory traversal attacks via basename sanitization.
   */
  async getBillImage(req, res, next) {
    try {
      const rawName = req.params.fileName;
      if (!rawName) {
        return res.status(400).json({ success: false, error: 'File name is required.' });
      }

      const safeBaseName = path.basename(rawName);
      const objectName = `bills/${safeBaseName}`;
      await storageService.streamBillImage(res, objectName);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Returns a short-lived (15 min) signed URL for direct browser retrieval from private S3 bucket.
   */
  async getBillImageSignedUrl(req, res, next) {
    try {
      const rawName = req.params.fileName;
      if (!rawName) {
        return res.status(400).json({ success: false, error: 'File name is required.' });
      }

      const safeBaseName = path.basename(rawName);
      const objectName = `bills/${safeBaseName}`;
      const signedUrl = await storageService.getBillImageSignedUrl(objectName, { expiresInMinutes: 15 });

      return res.status(200).json({
        success: true,
        data: {
          signedUrl,
          objectName,
          expiresInMinutes: 15
        }
      });
    } catch (err) {
      next(err);
    }
  }

  async getAllAssets(req, res, next) {
    try {
      const { search, category, status, assigned, page, limit } = req.query;
      const result = await assetService.getAllAssets({
        search,
        category,
        status,
        assigned,
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? Math.min(100, Math.max(1, parseInt(limit, 10))) : 50
      });

      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  async getAssetById(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, error: 'Invalid asset ID parameter.' });
      }

      const asset = await assetService.getAssetById(id);
      return res.status(200).json({
        success: true,
        data: { asset }
      });
    } catch (err) {
      next(err);
    }
  }

  async createAsset(req, res, next) {
    try {
      const adminId = req.admin ? req.admin.id : null;
      let asset;
      try {
        asset = await assetService.createAsset(req.body, adminId);
      } catch (createErr) {
        // Safe reconciliation: If upload succeeded but DB insert fails, clean up uploaded image
        if (req.body.bill_image_name) {
          await storageService.deleteBillImage(req.body.bill_image_name);
        }
        throw createErr;
      }

      return res.status(201).json({
        success: true,
        message: 'Asset registered successfully.',
        data: { asset }
      });
    } catch (err) {
      next(err);
    }
  }

  async updateAsset(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, error: 'Invalid asset ID parameter.' });
      }

      // Check existing asset for image replacement cleanup
      const existing = await assetService.getAssetById(id);
      const adminId = req.admin ? req.admin.id : null;
      const asset = await assetService.updateAsset(id, req.body, adminId);

      // If bill image was replaced and DB update succeeded, delete the old image safely
      if (
        req.body.bill_image_name !== undefined &&
        existing.bill_image_name &&
        existing.bill_image_name !== req.body.bill_image_name
      ) {
        await storageService.deleteBillImage(existing.bill_image_name);
      }

      return res.status(200).json({
        success: true,
        message: 'Asset updated successfully.',
        data: { asset }
      });
    } catch (err) {
      next(err);
    }
  }

  async assignAsset(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, error: 'Invalid asset ID parameter.' });
      }

      const { employee_id, notes } = req.body;
      const adminId = req.admin ? req.admin.id : null;
      const asset = await assetService.assignAsset(id, employee_id, adminId, notes);

      return res.status(200).json({
        success: true,
        message: `Asset '${asset.asset_tag}' successfully assigned to employee.`,
        data: { asset }
      });
    } catch (err) {
      next(err);
    }
  }

  async returnAsset(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, error: 'Invalid asset ID parameter.' });
      }

      const { notes } = req.body;
      const adminId = req.admin ? req.admin.id : null;
      const asset = await assetService.returnAsset(id, adminId, notes);

      return res.status(200).json({
        success: true,
        message: `Asset '${asset.asset_tag}' successfully returned to inventory.`,
        data: { asset }
      });
    } catch (err) {
      next(err);
    }
  }

  async getAssetHistory(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, error: 'Invalid asset ID parameter.' });
      }

      const history = await assetService.getAssetHistory(id);
      return res.status(200).json({
        success: true,
        data: { history }
      });
    } catch (err) {
      next(err);
    }
  }

  async deleteAsset(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, error: 'Invalid asset ID parameter.' });
      }

      const existing = await assetService.getAssetById(id);
      const adminId = req.admin ? req.admin.id : null;
      const result = await assetService.deleteAsset(id, adminId);

      // Clean up associated bill image if present and DB deletion succeeded
      if (existing.bill_image_name) {
        await storageService.deleteBillImage(existing.bill_image_name);
      }

      return res.status(200).json({
        success: true,
        message: 'Asset deleted successfully.',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new AssetController();
