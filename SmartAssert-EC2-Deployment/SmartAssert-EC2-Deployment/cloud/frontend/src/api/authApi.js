import { apiClient } from './client';

/**
 * Authentication API Service
 * Interacts with backend /api/auth endpoints using HttpOnly cookies exclusively.
 */
export const authApi = {
  /**
   * Submits administrator credentials.
   * Backend sets the HttpOnly cookie and returns the sanitized administrator profile.
   */
  async login(identifier, password) {
    const response = await apiClient.post('/api/auth/login', {
      identifier: identifier.trim(),
      password
    });
    return response.data.administrator;
  },

  /**
   * Revokes the server-side session in SQLite and clears the cookie.
   */
  async logout() {
    return await apiClient.post('/api/auth/logout', {});
  },

  /**
   * Fetches the current authenticated administrator profile using active cookie session.
   */
  async getMe() {
    const response = await apiClient.get('/api/auth/me');
    return response.data.administrator;
  }
};
