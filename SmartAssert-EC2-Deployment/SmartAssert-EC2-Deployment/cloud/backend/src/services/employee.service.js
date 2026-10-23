const employeeRepository = require('../repositories/employee.repository');
const auditRepository = require('../repositories/audit.repository');

class EmployeeService {
  /**
   * Retrieves paginated employee list with search and filters.
   */
  async getAllEmployees(options = {}) {
    return await employeeRepository.findAll(options);
  }

  /**
   * Retrieves single employee by ID.
   */
  async getEmployeeById(id) {
    const employee = await employeeRepository.findById(id);
    if (!employee) {
      const err = new Error(`Employee with ID ${id} was not found.`);
      err.statusCode = 404;
      throw err;
    }
    return employee;
  }

  /**
   * Validates employee input data.
   */
  validatePayload(data, isUpdate = false) {
    const { employee_code, first_name, last_name, email, department, designation, status } = data;

    if (!isUpdate || employee_code !== undefined) {
      if (!employee_code || !employee_code.trim()) {
        const err = new Error('Employee code is required.');
        err.statusCode = 400;
        throw err;
      }
    }

    if (!isUpdate || first_name !== undefined) {
      if (!first_name || !first_name.trim()) {
        const err = new Error('First name is required.');
        err.statusCode = 400;
        throw err;
      }
    }

    if (!isUpdate || last_name !== undefined) {
      if (!last_name || !last_name.trim()) {
        const err = new Error('Last name is required.');
        err.statusCode = 400;
        throw err;
      }
    }

    if (!isUpdate || email !== undefined) {
      if (!email || !email.trim()) {
        const err = new Error('Email address is required.');
        err.statusCode = 400;
        throw err;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        const err = new Error('Invalid email address format.');
        err.statusCode = 400;
        throw err;
      }
    }

    if (!isUpdate || department !== undefined) {
      if (!department || !department.trim()) {
        const err = new Error('Department is required.');
        err.statusCode = 400;
        throw err;
      }
    }

    if (!isUpdate || designation !== undefined) {
      if (!designation || !designation.trim()) {
        const err = new Error('Designation / Job title is required.');
        err.statusCode = 400;
        throw err;
      }
    }

    if (status !== undefined && status !== null) {
      const validStatuses = ['ACTIVE', 'ON_LEAVE', 'TERMINATED'];
      if (!validStatuses.includes(status)) {
        const err = new Error(`Invalid employment status '${status}'. Must be one of: ${validStatuses.join(', ')}.`);
        err.statusCode = 400;
        throw err;
      }
    }
  }

  /**
   * Creates a new employee after enforcing unique code and email constraints.
   */
  async createEmployee(data, adminId = null) {
    this.validatePayload(data, false);

    const code = data.employee_code.trim();
    const email = data.email.trim();

    // Check unique employee_code
    const existingCode = await employeeRepository.findByCode(code);
    if (existingCode) {
      const err = new Error(`Employee code '${code}' already exists.`);
      err.statusCode = 409;
      throw err;
    }

    // Check unique email
    const existingEmail = await employeeRepository.findByEmail(email);
    if (existingEmail) {
      const err = new Error(`Email '${email}' is already registered.`);
      err.statusCode = 409;
      throw err;
    }

    const newEmployee = await employeeRepository.create({
      employeeCode: code,
      firstName: data.first_name.trim(),
      lastName: data.last_name.trim(),
      email: email,
      department: data.department.trim(),
      designation: data.designation.trim(),
      status: data.status || 'ACTIVE'
    });

    // Record audit log
    await auditRepository.log({
      adminId,
      action: 'EMPLOYEE_CREATED',
      entityType: 'EMPLOYEE',
      entityId: newEmployee.id,
      details: {
        employee_code: newEmployee.employee_code,
        email: newEmployee.email,
        department: newEmployee.department
      }
    });

    return newEmployee;
  }

  /**
   * Updates an existing employee after verifying uniqueness.
   */
  async updateEmployee(id, data, adminId = null) {
    const existing = await employeeRepository.findById(id);
    if (!existing) {
      const err = new Error(`Employee with ID ${id} was not found.`);
      err.statusCode = 404;
      throw err;
    }

    this.validatePayload(data, true);

    const updatedCode = data.employee_code ? data.employee_code.trim() : existing.employee_code;
    const updatedEmail = data.email ? data.email.trim() : existing.email;

    // Check code collision
    if (updatedCode !== existing.employee_code) {
      const collision = await employeeRepository.findByCode(updatedCode);
      if (collision && collision.id !== Number(id)) {
        const err = new Error(`Employee code '${updatedCode}' is already in use by another employee.`);
        err.statusCode = 409;
        throw err;
      }
    }

    // Check email collision
    if (updatedEmail.toLowerCase() !== existing.email.toLowerCase()) {
      const collision = await employeeRepository.findByEmail(updatedEmail);
      if (collision && collision.id !== Number(id)) {
        const err = new Error(`Email '${updatedEmail}' is already in use by another employee.`);
        err.statusCode = 409;
        throw err;
      }
    }

    const updated = await employeeRepository.update(id, {
      employeeCode: updatedCode,
      firstName: data.first_name ? data.first_name.trim() : existing.first_name,
      lastName: data.last_name ? data.last_name.trim() : existing.last_name,
      email: updatedEmail,
      department: data.department ? data.department.trim() : existing.department,
      designation: data.designation ? data.designation.trim() : existing.designation,
      status: data.status !== undefined ? data.status : existing.status
    });

    // Record audit log
    await auditRepository.log({
      adminId,
      action: 'EMPLOYEE_UPDATED',
      entityType: 'EMPLOYEE',
      entityId: id,
      details: {
        employee_code: updated.employee_code,
        status: updated.status
      }
    });

    return updated;
  }

  /**
   * Safely deletes employee or rejects if assignment history/allocations exist.
   */
  async deleteEmployee(id, adminId = null) {
    const existing = await employeeRepository.findById(id);
    if (!existing) {
      const err = new Error(`Employee with ID ${id} was not found.`);
      err.statusCode = 404;
      throw err;
    }

    const { historyCount, activeAssetsCount, activeLicensesCount } =
      await employeeRepository.getCustodyHistoryCount(id);

    if (activeAssetsCount > 0) {
      const err = new Error(
        `Cannot delete employee '${existing.employee_code}'. They currently hold ${activeAssetsCount} assigned hardware asset(s). Please return all assets first.`
      );
      err.statusCode = 409;
      throw err;
    }

    if (historyCount > 0 || activeLicensesCount > 0) {
      const err = new Error(
        `Cannot delete employee '${existing.employee_code}' with existing asset assignment history (${historyCount} record(s)) to preserve audit integrity. Update their status to 'TERMINATED' instead.`
      );
      err.statusCode = 409;
      throw err;
    }

    await employeeRepository.delete(id);

    // Record audit log
    await auditRepository.log({
      adminId,
      action: 'EMPLOYEE_DELETED',
      entityType: 'EMPLOYEE',
      entityId: id,
      details: {
        employee_code: existing.employee_code,
        email: existing.email
      }
    });

    return { id: Number(id), deleted: true };
  }
}

module.exports = new EmployeeService();
