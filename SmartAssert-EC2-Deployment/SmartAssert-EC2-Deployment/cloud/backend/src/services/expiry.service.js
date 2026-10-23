const licenseRepository = require('../repositories/license.repository');
const db = require('../config/database');

/**
 * Expiry classification buckets.
 * Derived from actual database dates compared to current UTC date.
 */
const EXPIRY_BUCKETS = {
  EXPIRED: 'EXPIRED',
  EXPIRING_7_DAYS: 'EXPIRING_7_DAYS',
  EXPIRING_30_DAYS: 'EXPIRING_30_DAYS',
  VALID: 'VALID',
  NO_EXPIRY: 'NO_EXPIRY'
};

class ExpiryService {
  /**
   * Classifies a single date string into an expiry bucket relative to today.
   * @param {string|null} dateStr - ISO date string (YYYY-MM-DD) or null.
   * @returns {{ bucket: string, daysRemaining: number|null }}
   */
  classifyExpiry(dateStr) {
    if (!dateStr) {
      return { bucket: EXPIRY_BUCKETS.NO_EXPIRY, daysRemaining: null };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiryDate = new Date(dateStr);
    expiryDate.setHours(0, 0, 0, 0);

    const diffMs = expiryDate.getTime() - today.getTime();
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (daysRemaining < 0) {
      return { bucket: EXPIRY_BUCKETS.EXPIRED, daysRemaining };
    }
    if (daysRemaining <= 7) {
      return { bucket: EXPIRY_BUCKETS.EXPIRING_7_DAYS, daysRemaining };
    }
    if (daysRemaining <= 30) {
      return { bucket: EXPIRY_BUCKETS.EXPIRING_30_DAYS, daysRemaining };
    }
    return { bucket: EXPIRY_BUCKETS.VALID, daysRemaining };
  }

  /**
   * Retrieves all software licenses with expiry classification.
   * @param {Object} [options] - { bucket, search }
   * @returns {{ licenses: Array, summary: Object }}
   */
  async getLicenseExpiry(options = {}) {
    const { bucket, search } = options;

    // Fetch all licenses (no pagination for expiry view — manageable for SME scale)
    const result = await licenseRepository.findAll({
      search,
      page: 1,
      limit: 1000
    });

    const classified = result.licenses.map(license => {
      const classification = this.classifyExpiry(license.expiry_date);
      return {
        ...license,
        expiry_bucket: classification.bucket,
        days_remaining: classification.daysRemaining
      };
    });

    // Filter by bucket if requested
    let filtered = classified;
    if (bucket && EXPIRY_BUCKETS[bucket]) {
      filtered = classified.filter(l => l.expiry_bucket === bucket);
    }

    // Build summary counts
    const summary = {
      total: classified.length,
      expired: classified.filter(l => l.expiry_bucket === EXPIRY_BUCKETS.EXPIRED).length,
      expiring_7_days: classified.filter(l => l.expiry_bucket === EXPIRY_BUCKETS.EXPIRING_7_DAYS).length,
      expiring_30_days: classified.filter(l => l.expiry_bucket === EXPIRY_BUCKETS.EXPIRING_30_DAYS).length,
      valid: classified.filter(l => l.expiry_bucket === EXPIRY_BUCKETS.VALID).length,
      no_expiry: classified.filter(l => l.expiry_bucket === EXPIRY_BUCKETS.NO_EXPIRY).length,
      near_expiry_total: 0
    };
    summary.near_expiry_total = summary.expired + summary.expiring_7_days + summary.expiring_30_days;

    return {
      licenses: filtered,
      summary
    };
  }

  /**
   * Retrieves hardware assets with warranty expiry classification.
   * @param {Object} [options] - { bucket, search }
   * @returns {{ assets: Array, summary: Object }}
   */
  async getAssetWarrantyExpiry(options = {}) {
    const { bucket, search } = options;

    let whereClauses = [];
    let params = [];

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      whereClauses.push('(a.name LIKE ? OR a.asset_tag LIKE ? OR a.manufacturer LIKE ?)');
      params.push(term, term, term);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const assets = await db.query(
      `SELECT
        a.*,
        e.first_name || ' ' || e.last_name AS assigned_employee_name,
        e.employee_code AS assigned_employee_code
       FROM assets a
       LEFT JOIN employees e ON a.current_employee_id = e.id
       ${whereSql}
       ORDER BY a.warranty_expiry ASC NULLS LAST, a.id DESC`,
      params
    );

    const classified = assets.map(asset => {
      const classification = this.classifyExpiry(asset.warranty_expiry);
      return {
        ...asset,
        warranty_bucket: classification.bucket,
        warranty_days_remaining: classification.daysRemaining
      };
    });

    let filtered = classified;
    if (bucket && EXPIRY_BUCKETS[bucket]) {
      filtered = classified.filter(a => a.warranty_bucket === bucket);
    }

    const summary = {
      total: classified.length,
      expired: classified.filter(a => a.warranty_bucket === EXPIRY_BUCKETS.EXPIRED).length,
      expiring_7_days: classified.filter(a => a.warranty_bucket === EXPIRY_BUCKETS.EXPIRING_7_DAYS).length,
      expiring_30_days: classified.filter(a => a.warranty_bucket === EXPIRY_BUCKETS.EXPIRING_30_DAYS).length,
      valid: classified.filter(a => a.warranty_bucket === EXPIRY_BUCKETS.VALID).length,
      no_expiry: classified.filter(a => a.warranty_bucket === EXPIRY_BUCKETS.NO_EXPIRY).length,
      near_expiry_total: 0
    };
    summary.near_expiry_total = summary.expired + summary.expiring_7_days + summary.expiring_30_days;

    return {
      assets: filtered,
      summary
    };
  }

  /**
   * Returns combined dashboard expiry summary.
   */
  async getDashboardExpirySummary() {
    const [licenseExpiry, warrantyExpiry] = await Promise.all([
      this.getLicenseExpiry(),
      this.getAssetWarrantyExpiry()
    ]);

    return {
      licenses: licenseExpiry.summary,
      warranties: warrantyExpiry.summary
    };
  }
}

module.exports = new ExpiryService();
