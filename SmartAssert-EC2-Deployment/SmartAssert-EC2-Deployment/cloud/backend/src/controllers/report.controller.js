const { ReportService } = require('../services/report.service');

const VALID_REPORT_TYPES = [
  'asset_inventory',
  'assigned_assets',
  'assignment_history',
  'license_inventory',
  'seat_utilization',
  'expired_licenses',
  'expiring_licenses'
];

class ReportController {
  /**
   * GET /api/reports/:type
   * Returns JSON report data for a given report type.
   */
  async getReport(req, res, next) {
    try {
      const { type } = req.params;
      const filters = req.query;

      if (!VALID_REPORT_TYPES.includes(type)) {
        return res.status(400).json({
          success: false,
          error: `Invalid report type '${type}'. Valid types: ${VALID_REPORT_TYPES.join(', ')}`
        });
      }

      let data;
      switch (type) {
        case 'asset_inventory':
          data = await ReportService.getAssetInventoryReport(filters);
          break;
        case 'assigned_assets':
          data = await ReportService.getAssignedAssetsReport();
          break;
        case 'assignment_history':
          data = await ReportService.getAssignmentHistoryReport();
          break;
        case 'license_inventory':
          data = await ReportService.getLicenseInventoryReport(filters);
          break;
        case 'seat_utilization':
          data = await ReportService.getSeatUtilizationReport();
          break;
        case 'expired_licenses': {
          const expiryService = require('../services/expiry.service');
          const result = await expiryService.getLicenseExpiry({ bucket: 'EXPIRED' });
          data = result.licenses;
          break;
        }
        case 'expiring_licenses': {
          const expiryService = require('../services/expiry.service');
          const result = await expiryService.getLicenseExpiry();
          data = result.licenses.filter(l =>
            l.expiry_bucket === 'EXPIRING_7_DAYS' || l.expiry_bucket === 'EXPIRING_30_DAYS'
          );
          break;
        }
      }

      res.status(200).json({
        success: true,
        data: {
          report_type: type,
          generated_at: new Date().toISOString(),
          record_count: data.length,
          records: data
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/reports/:type/csv
   * Returns a CSV download of the specified report.
   */
  async downloadCsv(req, res, next) {
    try {
      const { type } = req.params;
      const filters = req.query;

      if (!VALID_REPORT_TYPES.includes(type)) {
        return res.status(400).json({
          success: false,
          error: `Invalid report type '${type}'. Valid types: ${VALID_REPORT_TYPES.join(', ')}`
        });
      }

      const csvContent = await ReportService.generateCsv(type, filters);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `assetflow_${type}_${timestamp}.csv`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.status(200).send(csvContent);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/reports
   * Lists available report types with descriptions.
   */
  async listReportTypes(req, res) {
    res.status(200).json({
      success: true,
      data: {
        report_types: [
          { type: 'asset_inventory', description: 'Complete hardware asset inventory with assignment status', supports_csv: true },
          { type: 'assigned_assets', description: 'Currently assigned assets with employee details', supports_csv: true },
          { type: 'assignment_history', description: 'Chronological asset assignment and return history', supports_csv: true },
          { type: 'license_inventory', description: 'Complete software license inventory', supports_csv: true },
          { type: 'seat_utilization', description: 'License seat utilization percentages', supports_csv: true },
          { type: 'expired_licenses', description: 'Licenses with expired dates', supports_csv: true },
          { type: 'expiring_licenses', description: 'Licenses expiring within 30 days', supports_csv: true }
        ]
      }
    });
  }
}

module.exports = new ReportController();
