const employeeService = require('../services/employee.service');

/**
 * Controller handling employee management endpoints.
 */
class EmployeeController {
  async getAllEmployees(req, res, next) {
    try {
      const { search, department, status, page, limit } = req.query;
      const result = await employeeService.getAllEmployees({
        search,
        department,
        status,
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? Math.min(100, Math.max(1, parseInt(limit, 10))) : 50
      });

      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  async getEmployeeById(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, error: 'Invalid employee ID parameter.' });
      }

      const employee = await employeeService.getEmployeeById(id);
      return res.status(200).json({
        success: true,
        data: { employee }
      });
    } catch (err) {
      next(err);
    }
  }

  async createEmployee(req, res, next) {
    try {
      const adminId = req.admin ? req.admin.id : null;
      const employee = await employeeService.createEmployee(req.body, adminId);

      return res.status(201).json({
        success: true,
        message: 'Employee created successfully.',
        data: { employee }
      });
    } catch (err) {
      next(err);
    }
  }

  async updateEmployee(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, error: 'Invalid employee ID parameter.' });
      }

      const adminId = req.admin ? req.admin.id : null;
      const employee = await employeeService.updateEmployee(id, req.body, adminId);

      return res.status(200).json({
        success: true,
        message: 'Employee updated successfully.',
        data: { employee }
      });
    } catch (err) {
      next(err);
    }
  }

  async deleteEmployee(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, error: 'Invalid employee ID parameter.' });
      }

      const adminId = req.admin ? req.admin.id : null;
      const result = await employeeService.deleteEmployee(id, adminId);

      return res.status(200).json({
        success: true,
        message: 'Employee deleted successfully.',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new EmployeeController();
