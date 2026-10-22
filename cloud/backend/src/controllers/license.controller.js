const licenseService = require('../services/license.service');

class LicenseController {
  /**
   * GET /api/licenses
   */
  async getAllLicenses(req, res, next) {
    try {
      const { search, type, status, page = 1, limit = 50 } = req.query;
      const result = await licenseService.getAllLicenses({
        search,
        type,
        status,
        page: parseInt(page, 10) || 1,
        limit: Math.min(100, Math.max(1, parseInt(limit, 10) || 50))
      });

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/licenses/:id
   */
  async getLicenseById(req, res, next) {
    try {
      const licenseId = parseInt(req.params.id, 10);
      if (isNaN(licenseId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid license ID parameter.'
        });
      }

      const license = await licenseService.getLicenseById(licenseId);
      res.status(200).json({
        success: true,
        data: { license }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/licenses
   */
  async createLicense(req, res, next) {
    try {
      const adminId = req.admin ? req.admin.id : null;
      const license = await licenseService.createLicense(req.body, adminId);

      res.status(201).json({
        success: true,
        data: { license },
        message: 'Software license created successfully.'
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PUT /api/licenses/:id
   */
  async updateLicense(req, res, next) {
    try {
      const licenseId = parseInt(req.params.id, 10);
      if (isNaN(licenseId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid license ID parameter.'
        });
      }

      const adminId = req.admin ? req.admin.id : null;
      const license = await licenseService.updateLicense(licenseId, req.body, adminId);

      res.status(200).json({
        success: true,
        data: { license },
        message: 'Software license updated successfully.'
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/licenses/:id
   */
  async deleteLicense(req, res, next) {
    try {
      const licenseId = parseInt(req.params.id, 10);
      if (isNaN(licenseId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid license ID parameter.'
        });
      }

      const adminId = req.admin ? req.admin.id : null;
      const result = await licenseService.deleteLicense(licenseId, adminId);

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/licenses/:id/allocations
   */
  async getAllocations(req, res, next) {
    try {
      const licenseId = parseInt(req.params.id, 10);
      if (isNaN(licenseId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid license ID parameter.'
        });
      }

      const allocations = await licenseService.getAllocationsByLicense(licenseId);
      res.status(200).json({
        success: true,
        data: { allocations }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/licenses/:id/allocations
   */
  async allocateSeat(req, res, next) {
    try {
      const licenseId = parseInt(req.params.id, 10);
      if (isNaN(licenseId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid license ID parameter.'
        });
      }

      const adminId = req.admin ? req.admin.id : null;
      const result = await licenseService.allocateSeat(licenseId, req.body, adminId);

      res.status(201).json({
        success: true,
        data: result,
        message: 'Seat allocated successfully.'
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/licenses/:id/allocations/:allocationId/revoke
   */
  async revokeAllocation(req, res, next) {
    try {
      const licenseId = parseInt(req.params.id, 10);
      const allocationId = parseInt(req.params.allocationId, 10);

      if (isNaN(licenseId) || isNaN(allocationId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid license or allocation ID parameter.'
        });
      }

      const adminId = req.admin ? req.admin.id : null;
      const result = await licenseService.revokeAllocation(licenseId, allocationId, adminId);

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new LicenseController();
