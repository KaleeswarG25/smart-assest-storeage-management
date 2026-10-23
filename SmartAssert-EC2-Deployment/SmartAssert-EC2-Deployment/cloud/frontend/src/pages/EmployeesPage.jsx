import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Plus,
  Search,
  RefreshCw,
  Edit2,
  Trash2,
  AlertCircle,
  X,
  CheckCircle2,
  Clock,
  UserX,
  Building2,
  Mail,
  Briefcase
} from 'lucide-react';
import { employeeApi } from '../api/employeeApi';

const DEPARTMENTS = [
  'Engineering',
  'IT & Infrastructure',
  'Product & Design',
  'Human Resources',
  'Finance',
  'Operations',
  'Sales & Marketing'
];

const STATUSES = ['ACTIVE', 'ON_LEAVE', 'TERMINATED'];

export function EmployeesPage() {
  const [employees, setEmployees] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const limit = 10;

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [formData, setFormData] = useState({
    employee_code: '',
    full_name: '',
    email: '',
    department: 'Engineering',
    job_title: '',
    status: 'ACTIVE'
  });
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Fetch employees
  const fetchEmployees = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await employeeApi.list({
        search: search.trim(),
        department: departmentFilter,
        status: statusFilter,
        page,
        limit
      });
      setEmployees(res.employees || []);
      setTotalCount(res.pagination?.total || 0);
    } catch (err) {
      setError(err.message || 'Failed to load employees from server.');
    } finally {
      setLoading(false);
    }
  }, [search, departmentFilter, statusFilter, page]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // Open Create Modal
  const handleOpenCreate = () => {
    setFormData({
      employee_code: '',
      full_name: '',
      email: '',
      department: 'Engineering',
      job_title: '',
      status: 'ACTIVE'
    });
    setFormError(null);
    setShowCreateModal(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (emp) => {
    setEditingEmployee(emp);
    setFormData({
      employee_code: emp.employee_code || '',
      full_name: emp.full_name || '',
      email: emp.email || '',
      department: emp.department || 'Engineering',
      job_title: emp.job_title || '',
      status: emp.status || 'ACTIVE'
    });
    setFormError(null);
  };

  // Submit Create or Edit
  const handleSubmitForm = async (e) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.full_name.trim()) {
      setFormError('Full name is required.');
      return;
    }
    if (!formData.email.trim()) {
      setFormError('Email address is required.');
      return;
    }
    if (!formData.employee_code.trim()) {
      setFormError('Employee code is required.');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        employee_code: formData.employee_code.trim(),
        full_name: formData.full_name.trim(),
        email: formData.email.trim(),
        department: formData.department,
        job_title: formData.job_title.trim() || null,
        status: formData.status
      };

      if (!editingEmployee) {
        await employeeApi.create(payload);
        setShowCreateModal(false);
      } else {
        await employeeApi.update(editingEmployee.id, payload);
        setEditingEmployee(null);
      }

      await fetchEmployees();
    } catch (err) {
      setFormError(err.message || 'Operation failed. Please verify your inputs.');
    } finally {
      setSubmitting(false);
    }
  };

  // Safe Deletion / Deactivation
  const handleDeleteEmployee = async (emp) => {
    const confirmMsg = `Are you sure you want to delete employee "${emp.full_name}" (${emp.employee_code})?\n\nNote: Employees with hardware custody history cannot be physically deleted; they must be deactivated (TERMINATED) to preserve audit trails.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await employeeApi.delete(emp.id);
      await fetchEmployees();
    } catch (err) {
      alert(`Deletion rejected: ${err.message}`);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'ACTIVE':
        return <span className="status-pill status-pill-active"><CheckCircle2 size={12} /> Active</span>;
      case 'ON_LEAVE':
        return <span className="status-pill status-pill-onleave"><Clock size={12} /> On Leave</span>;
      case 'TERMINATED':
        return <span className="status-pill status-pill-terminated"><UserX size={12} /> Terminated</span>;
      default:
        return <span className="status-pill status-pill-retired">{status}</span>;
    }
  };

  const totalPages = Math.ceil(totalCount / limit) || 1;

  return (
    <div>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 700, color: 'var(--color-slate-900)' }}>
            Employee Management & Custody Directory
          </h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="btn btn-outline" onClick={fetchEmployees} disabled={loading} title="Refresh directory">
            <RefreshCw size={16} className={loading ? 'spinner' : ''} />
            Refresh
          </button>
          <button className="btn btn-primary" onClick={handleOpenCreate}>
            <Plus size={16} />
            Add Employee
          </button>
        </div>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="alert-banner alert-danger" role="alert">
          <AlertCircle size={20} />
          <div style={{ flex: 1 }}>
            <strong>Unable to load employees:</strong> {error}
          </div>
          <button className="btn btn-outline btn-sm" onClick={fetchEmployees}>Retry</button>
        </div>
      )}

      {/* Table Card */}
      <div className="table-card">
        {/* Table Toolbar */}
        <div className="table-toolbar">
          <div className="table-filters">
            <div className="search-input-wrapper">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                className="search-input"
                placeholder="Search by code, name, or email..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>

            <select
              className="filter-select"
              value={departmentFilter}
              onChange={(e) => {
                setDepartmentFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by Department"
            >
              <option value="">All Departments</option>
              {DEPARTMENTS.map(dept => <option key={dept} value={dept}>{dept}</option>)}
            </select>

            <select
              className="filter-select"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by Status"
            >
              <option value="">All Statuses</option>
              {STATUSES.map(st => <option key={st} value={st}>{st.replace('_', ' ')}</option>)}
            </select>
          </div>

          <div style={{ fontSize: '0.85rem', color: 'var(--color-slate-500)', fontWeight: 500 }}>
            Total: <strong>{totalCount}</strong> employees
          </div>
        </div>

        {/* Table Content */}
        <div className="table-responsive">
          {loading ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--color-slate-500)' }}>
              <div className="spinner" style={{ margin: '0 auto 12px' }}></div>
              Loading employees from database...
            </div>
          ) : employees.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--color-slate-500)' }}>
              <Users size={36} color="var(--color-slate-300)" style={{ margin: '0 auto 12px' }} />
              <p style={{ fontWeight: 600, color: 'var(--color-slate-700)' }}>No employee records found</p>
              <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>
                {search || departmentFilter || statusFilter
                  ? 'Try clearing or modifying your search filters.'
                  : 'Get started by creating your first employee profile.'}
              </p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee Code</th>
                  <th>Full Name</th>
                  <th>Email</th>
                  <th>Department</th>
                  <th>Job Title</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => (
                  <tr key={emp.id}>
                    <td>
                      <strong style={{ color: 'var(--color-slate-900)', fontFamily: 'monospace' }}>
                        {emp.employee_code}
                      </strong>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--color-slate-800)' }}>{emp.full_name}</div>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.82rem', color: 'var(--color-slate-600)' }}>{emp.email}</span>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--color-slate-700)' }}>
                        {emp.department}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.82rem', color: 'var(--color-slate-600)' }}>
                        {emp.job_title || '—'}
                      </span>
                    </td>
                    <td>{getStatusBadge(emp.status)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                        <button
                          className="btn-icon"
                          onClick={() => handleOpenEdit(emp)}
                          title="Edit Employee"
                          aria-label={`Edit ${emp.full_name}`}
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          className="btn-icon danger"
                          onClick={() => handleDeleteEmployee(emp)}
                          title="Delete Employee"
                          aria-label={`Delete ${emp.full_name}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Table Pagination */}
        <div className="table-pagination">
          <div>
            Showing page <strong>{page}</strong> of <strong>{totalPages}</strong>
          </div>
          <div className="pagination-controls">
            <button
              className="btn btn-outline btn-sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <button
              className="btn btn-outline btn-sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* CREATE / EDIT EMPLOYEE MODAL */}
      {(showCreateModal || editingEmployee) && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">
                {editingEmployee ? `Edit Employee: ${editingEmployee.full_name}` : 'Create Employee Profile'}
              </h3>
              <button
                className="btn-icon"
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingEmployee(null);
                }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitForm}>
              <div className="modal-body">
                {formError && (
                  <div className="alert-banner alert-danger" style={{ marginBottom: '16px' }}>
                    <AlertCircle size={18} />
                    <span>{formError}</span>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group">
                    <label className="form-label">Employee Code *</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. EMP-2026-0008"
                      value={formData.employee_code}
                      onChange={(e) => setFormData({ ...formData, employee_code: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Employment Status *</label>
                    <select
                      className="form-input"
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    >
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="ON_LEAVE">ON_LEAVE</option>
                      <option value="TERMINATED">TERMINATED</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Full Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Sarah Connor"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Corporate Email *</label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="e.g. sconnor@assetflow.local"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group">
                    <label className="form-label">Department *</label>
                    <select
                      className="form-input"
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    >
                      {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Job Title</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Senior DevOps Engineer"
                      value={formData.job_title}
                      onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingEmployee(null);
                  }}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Saving...' : editingEmployee ? 'Update Profile' : 'Create Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
