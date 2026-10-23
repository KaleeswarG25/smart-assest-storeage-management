import { apiClient } from './client';

/**
 * Asset Inventory API Client
 * Interacts with backend /api/assets endpoints.
 */
export const assetApi = {
  /**
   * Fetches assets with optional search and filters.
   * @param {Object} [params] - { search, category, status, assigned, page, limit }
   */
  async list(params = {}) {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.category) query.set('category', params.category);
    if (params.status) query.set('status', params.status);
    if (params.assigned !== undefined && params.assigned !== '') query.set('assigned', params.assigned);
    if (params.page) query.set('page', params.page);
    if (params.limit) query.set('limit', params.limit);

    const queryString = query.toString() ? `?${query.toString()}` : '';
    const res = await apiClient.get(`/api/assets${queryString}`);
    return res.data;
  },

  /**
   * Fetches a single asset by its primary key.
   */
  async getById(id) {
    const res = await apiClient.get(`/api/assets/${id}`);
    return res.data.asset;
  },

  /**
   * Uploads an asset purchase bill/invoice image.
   * @param {Object} data - { image: base64DataUrl, fileName, mimeType }
   * @returns {Promise<{ url: string, fileName: string, originalName: string, provider: string }>}
   */
  async uploadBill(data) {
    const res = await apiClient.post('/api/assets/upload-bill', data);
    return res.data;
  },

  /**
   * Creates a new hardware asset.
   */
  async create(assetData) {
    const res = await apiClient.post('/api/assets', assetData);
    return res.data.asset;
  },

  /**
   * Updates an existing hardware asset.
   */
  async update(id, assetData) {
    const res = await apiClient.put(`/api/assets/${id}`, assetData);
    return res.data.asset;
  },

  /**
   * Deletes an asset (only allowed if safe and without historical assignment records).
   */
  async delete(id) {
    return await apiClient.delete(`/api/assets/${id}`);
  },

  /**
   * Assigns an available asset to an active employee.
   */
  async assign(id, employeeId, notes = '') {
    const res = await apiClient.post(`/api/assets/${id}/assign`, {
      employee_id: employeeId,
      notes
    });
    return res.data;
  },

  /**
   * Returns an assigned asset back to the available inventory pool.
   */
  async returnAsset(id, returnNotes = '') {
    const res = await apiClient.post(`/api/assets/${id}/return`, {
      return_notes: returnNotes
    });
    return res.data;
  },

  /**
   * Fetches chronological assignment history records for an asset.
   */
  async getHistory(id) {
    const res = await apiClient.get(`/api/assets/${id}/history`);
    return res.data.history;
  },

  /**
   * Fetches a short-lived (15 min) signed URL for an asset bill image
   */
  async getBillSignedUrl(fileName) {
    const res = await apiClient.get(`/api/assets/bills/${encodeURIComponent(fileName)}/signed-url`);
    return res.data.signedUrl;
  }
};

export { resolveAssetUrl } from './client';

