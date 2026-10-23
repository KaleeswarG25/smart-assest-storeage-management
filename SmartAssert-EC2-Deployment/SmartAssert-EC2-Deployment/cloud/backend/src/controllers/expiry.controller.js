const expiryService = require('../services/expiry.service');

class ExpiryController {
  /**
   * GET /api/expiry/licenses
   * Returns classified license expiry data with summary.
   */
  async getLicenseExpiry(req, res, next) {
    try {
      const { bucket, search } = req.query;
      const result = await expiryService.getLicenseExpiry({ bucket, search });

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/expiry/warranties
   * Returns classified hardware asset warranty expiry data with summary.
   */
  async getWarrantyExpiry(req, res, next) {
    try {
      const { bucket, search } = req.query;
      const result = await expiryService.getAssetWarrantyExpiry({ bucket, search });

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/expiry/summary
   * Returns dashboard-friendly combined expiry summary.
   */
  async getDashboardSummary(req, res, next) {
    try {
      const summary = await expiryService.getDashboardExpirySummary();

      res.status(200).json({
        success: true,
        data: summary
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new ExpiryController();
