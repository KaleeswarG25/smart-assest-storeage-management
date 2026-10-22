import { apiClient } from './client';

/**
 * Software License Management API Client
 * Interacts with backend /api/licenses endpoints.
 */
export const licenseApi = {
  /**
   * Fetches software licenses with optional search, filters, and pagination.
   * @param {Object} [params] - { search, type, status, page, limit }
   */
  async list(params = {}) {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.type) query.set('type', params.type);
    if (params.status) query.set('status', params.status);
    if (params.page) query.set('page', params.page);
    if (params.limit) query.set('limit', params.limit);

    const queryString = query.toString() ? `?${query.toString()}` : '';
    const res = await apiClient.get(`/api/licenses${queryString}`);
    return res.data;
  },

  /**
   * Fetches a single software license by ID.
   */
  async getById(id) {
    const res = await apiClient.get(`/api/licenses/${id}`);
    return res.data.license;
  },

  /**
   * Registers a new software license.
   */
  async create(licenseData) {
    const res = await apiClient.post('/api/licenses', licenseData);
    return res.data.license;
  },

  /**
   * Updates an existing software license's metadata.
   */
  async update(id, licenseData) {
    const res = await apiClient.put(`/api/licenses/${id}`, licenseData);
    return res.data.license;
  },

  /**
   * Safely deletes a license (rejected if allocations exist).
   */
  async delete(id) {
    return await apiClient.delete(`/api/licenses/${id}`);
  },

  /**
   * Fetches all allocations (active and historical) for a license.
   */
  async getAllocations(id) {
    const res = await apiClient.get(`/api/licenses/${id}/allocations`);
    return res.data.allocations;
  },

  /**
   * Allocates a seat to an employee.
   */
  async allocateSeat(id, allocationData) {
    const res = await apiClient.post(`/api/licenses/${id}/allocations`, allocationData);
    return res.data;
  },

  /**
   * Revokes an active seat allocation.
   */
  async revokeAllocation(id, allocationId) {
    const res = await apiClient.post(`/api/licenses/${id}/allocations/${allocationId}/revoke`, {});
    return res.data;
  }
};
