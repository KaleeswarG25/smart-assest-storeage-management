import { apiClient } from './client';

/**
 * Health API Service
 * Fetches real backend system health and SQLite database status.
 */
export const healthApi = {
  async getHealth() {
    return await apiClient.get('/api/health');
  }
};
