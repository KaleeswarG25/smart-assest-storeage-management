import { apiClient } from './client';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

/**
 * Reports & CSV Export API Client
 * Interacts with backend /api/reports endpoints.
 */
export const reportApi = {
  /**
   * Lists available report types with descriptions.
   */
  async listTypes() {
    const res = await apiClient.get('/api/reports');
    return res.data.report_types;
  },

  /**
   * Fetches JSON report data for a given type.
   * @param {string} type - Report type identifier.
   * @param {Object} [params] - Optional filters like search, category, status, type.
   */
  async getReport(type, params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) query.set(key, value);
    });
    const queryString = query.toString() ? `?${query.toString()}` : '';
    const res = await apiClient.get(`/api/reports/${type}${queryString}`);
    return res.data;
  },

  /**
   * Downloads CSV file for a given report type.
   * Uses fetch directly to handle binary blob download.
   * @param {string} type - Report type identifier.
   * @param {Object} [params] - Optional filters.
   */
  async downloadCsv(type, params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) query.set(key, value);
    });
    const queryString = query.toString() ? `?${query.toString()}` : '';
    const url = `${API_BASE_URL}/api/reports/${type}/csv${queryString}`;

    const response = await fetch(url, {
      credentials: 'include',
      headers: {
        'Accept': 'text/csv'
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Download failed' }));
      throw new Error(errorData.error || `CSV download failed (${response.status})`);
    }

    // Get filename from Content-Disposition header or generate one
    const disposition = response.headers.get('Content-Disposition');
    let filename = `assetflow_${type}_report.csv`;
    if (disposition) {
      const match = disposition.match(/filename="?([^"]+)"?/);
      if (match) filename = match[1];
    }

    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);

    return { success: true, filename };
  }
};
