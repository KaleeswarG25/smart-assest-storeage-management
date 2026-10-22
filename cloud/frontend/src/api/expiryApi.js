import { apiClient } from './client';

/**
 * Expiry Classification API Client
 * Interacts with backend /api/expiry endpoints.
 */
export const expiryApi = {
  /**
   * Fetches classified license expiry data.
   * @param {Object} [params] - { bucket, search }
   */
  async getLicenseExpiry(params = {}) {
    const query = new URLSearchParams();
    if (params.bucket) query.set('bucket', params.bucket);
    if (params.search) query.set('search', params.search);
    const queryString = query.toString() ? `?${query.toString()}` : '';
    const res = await apiClient.get(`/api/expiry/licenses${queryString}`);
    return res.data;
  },

  /**
   * Fetches classified hardware asset warranty expiry data.
   * @param {Object} [params] - { bucket, search }
   */
  async getWarrantyExpiry(params = {}) {
    const query = new URLSearchParams();
    if (params.bucket) query.set('bucket', params.bucket);
    if (params.search) query.set('search', params.search);
    const queryString = query.toString() ? `?${query.toString()}` : '';
    const res = await apiClient.get(`/api/expiry/warranties${queryString}`);
    return res.data;
  },

  /**
   * Fetches combined dashboard expiry summary.
   */
  async getDashboardSummary() {
    const res = await apiClient.get('/api/expiry/summary');
    return res.data;
  }
};
