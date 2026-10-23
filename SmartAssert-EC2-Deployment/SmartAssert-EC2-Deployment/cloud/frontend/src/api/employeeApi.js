import { apiClient } from './client';

/**
 * Employee Management API Client
 * Interacts with backend /api/employees endpoints.
 */
export const employeeApi = {
  /**
   * Fetches employees with optional search and filters.
   * @param {Object} [params] - { search, department, status, page, limit }
   */
  async list(params = {}) {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.department) query.set('department', params.department);
    if (params.status) query.set('status', params.status);
    if (params.page) query.set('page', params.page);
    if (params.limit) query.set('limit', params.limit);

    const queryString = query.toString() ? `?${query.toString()}` : '';
    const res = await apiClient.get(`/api/employees${queryString}`);
    return res.data;
  },

  /**
   * Fetches a single employee by their primary key.
   */
  async getById(id) {
    const res = await apiClient.get(`/api/employees/${id}`);
    return res.data.employee;
  },

  /**
   * Creates a new employee profile.
   */
  async create(employeeData) {
    const res = await apiClient.post('/api/employees', employeeData);
    return res.data.employee;
  },

  /**
   * Updates an existing employee profile.
   */
  async update(id, employeeData) {
    const res = await apiClient.put(`/api/employees/${id}`, employeeData);
    return res.data.employee;
  },

  /**
   * Deactivates or safely deletes an employee (blocked with 409 if active custody or history exists).
   */
  async delete(id) {
    return await apiClient.delete(`/api/employees/${id}`);
  }
};
