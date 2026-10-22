import React, { useState, useEffect, useCallback } from 'react';
import {
  KeyRound,
  Plus,
  Search,
  RefreshCw,
  Edit2,
  Trash2,
  Users,
  RotateCcw,
  AlertCircle,
  X,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Ban,
  Info,
  Calendar,
  Building2,
  UserCheck
} from 'lucide-react';
import { licenseApi } from '../api/licenseApi';
import { employeeApi } from '../api/employeeApi';

const LICENSE_TYPES = [
  'PERPETUAL',
  'ANNUAL_SUBSCRIPTION',
  'MONTHLY_SUBSCRIPTION',
  'VOLUME_SEAT',
  'OEM'
];

const RENEWAL_STATUSES = [
  'ACTIVE',
  'EXPIRING_SOON',
  'EXPIRED',
  'CANCELLED'
];

export function LicensesPage() {
  const [licenses, setLicenses] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const limit = 10;

  // Active employees for allocation dropdown
  const [employees, setEmployees] = useState([]);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingLicense, setEditingLicense] = useState(null);
  const [allocatingLicense, setAllocatingLicense] = useState(null);
  const [allocationsList, setAllocationsList] = useState([]);
  const [allocationsLoading, setAllocationsLoading] = useState(false);
  const [allocationTab, setAllocationTab] = useState('active'); // 'active' | 'history'

  // License Form State
  const [formData, setFormData] = useState({
    license_code: '',
    software_name: '',
    vendor: '',
    license_type: 'ANNUAL_SUBSCRIPTION',
    total_quantity: '1',
    purchase_date: '',
    expiry_date: '',
    purchase_cost: '',
    renewal_status: 'ACTIVE',
    notes: ''
  });
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Allocation Form State
  const [allocEmployeeId, setAllocEmployeeId] = useState('');
  const [allocNotes, setAllocNotes] = useState('');
  const [allocError, setAllocError] = useState(null);
  const [allocSubmitting, setAllocSubmitting] = useState(false);

  // Fetch licenses
  const fetchLicenses = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await licenseApi.list({
        search: search.trim(),
        type: typeFilter,
        status: statusFilter,
        page,
        limit
      });
      setLicenses(res.licenses || []);
      setTotalCount(res.pagination?.total || 0);
    } catch (err) {
      setError(err.message || 'Failed to load software licenses.');
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter, statusFilter, page]);

  useEffect(() => {
    fetchLicenses();
  }, [fetchLicenses]);

  // Load active employees
  const loadActiveEmployees = async () => {
    try {
      const res = await employeeApi.list({ limit: 100 });
      setEmployees((res.employees || []).filter((e) => e.status === 'ACTIVE'));
    } catch (err) {
      console.error('Failed to load employees for allocation:', err);
    }
  };

  // Open Create Modal
  const handleOpenCreate = () => {
    setFormData({
      license_code: '',
      software_name: '',
      vendor: '',
      license_type: 'ANNUAL_SUBSCRIPTION',
      total_quantity: '5',
      purchase_date: '',
      expiry_date: '',
      purchase_cost: '',
      renewal_status: 'ACTIVE',
      notes: ''
    });
    setFormError(null);
    setShowCreateModal(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (lic) => {
    setEditingLicense(lic);
    setFormData({
      license_code: lic.license_code || '',
      software_name: lic.software_name || '',
      vendor: lic.vendor || '',
      license_type: lic.license_type || 'ANNUAL_SUBSCRIPTION',
      total_quantity: String(lic.total_quantity || 1),
      purchase_date: lic.purchase_date || '',
      expiry_date: lic.expiry_date || '',
      purchase_cost: lic.purchase_cost !== null && lic.purchase_cost !== undefined ? String(lic.purchase_cost) : '',
      renewal_status: lic.renewal_status || 'ACTIVE',
      notes: lic.notes || ''
    });
    setFormError(null);
  };

  // Open Allocations Modal
  const handleOpenAllocations = async (lic) => {
    setAllocatingLicense(lic);
    setAllocError(null);
    setAllocEmployeeId('');
    setAllocNotes('');
    setAllocationTab('active');
    setAllocationsLoading(true);

    await loadActiveEmployees();
    try {
      const allocs = await licenseApi.getAllocations(lic.id);
      setAllocationsList(allocs || []);
    } catch (err) {
      setAllocError(err.message || 'Failed to fetch allocations.');
    } finally {
      setAllocationsLoading(false);
    }
  };

  // Submit Create or Edit
  const handleSubmitForm = async (e) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.software_name.trim()) {
      setFormError('Software name is required.');
      return;
    }
    if (!formData.vendor.trim()) {
      setFormError('Vendor is required.');
      return;
    }
    if (!formData.license_code.trim()) {
      setFormError('License code is required.');
      return;
    }

    const totalQty = parseInt(formData.total_quantity, 10);
    if (isNaN(totalQty) || totalQty <= 0) {
      setFormError('Purchased seats must be a positive integer greater than 0.');
      return;
    }

    if (editingLicense && totalQty < editingLicense.used_quantity) {
      setFormError(
        `Cannot reduce total seats (${totalQty}) below current active allocations (${editingLicense.used_quantity}). Revoke active seat allocations first.`
      );
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        license_code: formData.license_code.trim(),
        software_name: formData.software_name.trim(),
        vendor: formData.vendor.trim(),
        license_type: formData.license_type,
        total_quantity: totalQty,
        purchase_date: formData.purchase_date,
        expiry_date: formData.expiry_date ? formData.expiry_date : null,
        purchase_cost: formData.purchase_cost !== '' ? Number(formData.purchase_cost) : 0,
        renewal_status: formData.renewal_status,
        notes: formData.notes.trim() || null
      };

      if (!editingLicense) {
        await licenseApi.create(payload);
        setShowCreateModal(false);
      } else {
        await licenseApi.update(editingLicense.id, payload);
        setEditingLicense(null);
      }

      await fetchLicenses();
    } catch (err) {
      setFormError(err.message || 'Operation failed. Please verify your inputs.');
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Seat Allocation
  const handleAllocateSeat = async (e) => {
    e.preventDefault();
    setAllocError(null);

    if (!allocEmployeeId) {
      setAllocError('Please select an active employee to allocate a seat to.');
      return;
    }

    try {
      setAllocSubmitting(true);
      const res = await licenseApi.allocateSeat(allocatingLicense.id, {
        employee_id: Number(allocEmployeeId),
        notes: allocNotes.trim()
      });

      // Update state
      setAllocEmployeeId('');
      setAllocNotes('');

      // Refresh allocations list
      const updatedAllocs = await licenseApi.getAllocations(allocatingLicense.id);
      setAllocationsList(updatedAllocs || []);

      // Refresh current license object
      if (res.data?.license) {
        setAllocatingLicense(res.data.license);
      }

      // Refresh main table
      await fetchLicenses();
    } catch (err) {
      setAllocError(err.message || 'Allocation failed.');
    } finally {
      setAllocSubmitting(false);
    }
  };

  // Revoke Seat Allocation
  const handleRevokeAllocation = async (allocation) => {
    const confirmMsg = `Are you sure you want to revoke the license seat from ${allocation.employee_name} (${allocation.employee_code})?\n\nThis will return 1 seat back to the available inventory pool.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setAllocSubmitting(true);
      setAllocError(null);
      const res = await licenseApi.revokeAllocation(allocatingLicense.id, allocation.id);

      // Refresh allocations list
      const updatedAllocs = await licenseApi.getAllocations(allocatingLicense.id);
      setAllocationsList(updatedAllocs || []);

      // Refresh current license object
      if (res.license) {
        setAllocatingLicense(res.license);
      }

      // Refresh main table
      await fetchLicenses();
    } catch (err) {
      setAllocError(err.message || 'Revocation failed.');
    } finally {
      setAllocSubmitting(false);
    }
  };

  // Delete License
  const handleDeleteLicense = async (lic) => {
    const confirmMsg = `Are you sure you want to delete software license "${lic.software_name}" (${lic.license_code})?\n\nLicenses with historical or active seat allocations cannot be deleted to preserve compliance audit trails.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await licenseApi.delete(lic.id);
      await fetchLicenses();
    } catch (err) {
      alert(`Deletion rejected: ${err.message}`);
    }
  };

  const getRenewalStatusBadge = (status) => {
    switch (status) {
      case 'ACTIVE':
        return <span className="status-pill status-pill-available"><CheckCircle2 size={12} /> Active</span>;
      case 'EXPIRING_SOON':
        return <span className="status-pill status-pill-maintenance"><AlertTriangle size={12} /> Expiring Soon</span>;
      case 'EXPIRED':
        return <span className="status-pill status-pill-terminated"><Ban size={12} /> Expired</span>;
      case 'CANCELLED':
        return <span className="status-pill status-pill-retired"><X size={12} /> Cancelled</span>;
      default:
        return <span className="status-pill status-pill-retired">{status}</span>;
    }
  };

  const totalPages = Math.ceil(totalCount / limit) || 1;

  const activeAllocations = allocationsList.filter((a) => a.revoked_at === null);
  const revokedAllocations = allocationsList.filter((a) => a.revoked_at !== null);

  return (
    <div>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 700, color: 'var(--color-slate-900)' }}>
            Software License Management
          </h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="btn btn-outline" onClick={fetchLicenses} disabled={loading} title="Refresh catalog">
            <RefreshCw size={16} className={loading ? 'spinner' : ''} />
            Refresh
          </button>
          <button className="btn btn-primary" onClick={handleOpenCreate}>
            <Plus size={16} />
            Add License
          </button>
        </div>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="alert-banner alert-danger" role="alert">
          <AlertCircle size={20} />
          <div style={{ flex: 1 }}>
            <strong>Unable to load software licenses:</strong> {error}
          </div>
          <button className="btn btn-outline btn-sm" onClick={fetchLicenses}>Retry</button>
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
                placeholder="Search by title, vendor, or code..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>

            <select
              className="filter-select"
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by License Type"
            >
              <option value="">All License Types</option>
              {LICENSE_TYPES.map((t) => (
                <option key={t} value={t}>{t.replace('_', ' ')}</option>
              ))}
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
              {RENEWAL_STATUSES.map((s) => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
          </div>

          <div style={{ fontSize: '0.85rem', color: 'var(--color-slate-500)', fontWeight: 500 }}>
            Total: <strong>{totalCount}</strong> licenses
          </div>
        </div>

        {/* Table Content */}
        <div className="table-responsive">
          {loading ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--color-slate-500)' }}>
              <div className="spinner" style={{ margin: '0 auto 12px' }}></div>
              Loading software licenses from database...
            </div>
          ) : licenses.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--color-slate-500)' }}>
              <KeyRound size={36} color="var(--color-slate-300)" style={{ margin: '0 auto 12px' }} />
              <p style={{ fontWeight: 600, color: 'var(--color-slate-700)' }}>No software licenses found</p>
              <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>
                {search || typeFilter || statusFilter
                  ? 'Try clearing or modifying your search filters.'
                  : 'Get started by registering your first software license agreement.'}
              </p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>License Identifier</th>
                  <th>Software Title & Vendor</th>
                  <th>License Type</th>
                  <th>Seat Utilization</th>
                  <th>Expiration Date</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {licenses.map((lic) => {
                  const used = lic.used_quantity || 0;
                  const total = lic.total_quantity || 1;
                  const available = lic.available_quantity !== undefined ? lic.available_quantity : (total - used);
                  const pct = Math.min(100, Math.round((used / total) * 100));

                  return (
                    <tr key={lic.id}>
                      <td>
                        <strong style={{ color: 'var(--color-slate-900)', fontFamily: 'monospace' }}>
                          {lic.license_code}
                        </strong>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--color-slate-800)' }}>{lic.software_name}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--color-slate-500)' }}>{lic.vendor}</div>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--color-slate-600)' }}>
                          {lic.license_type.replace('_', ' ')}
                        </span>
                      </td>
                      <td>
                        <div className="utilization-container">
                          <div className="utilization-meta">
                            <span>{used} / {total} seats ({pct}%)</span>
                            <span style={{ color: available === 0 ? 'var(--color-danger-text)' : 'var(--color-success-text)' }}>
                              {available} avail
                            </span>
                          </div>
                          <div className="progress-track">
                            <div
                              className={`progress-bar ${pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : ''}`}
                              style={{ width: `${pct}%` }}
                              role="progressbar"
                              aria-valuenow={pct}
                              aria-valuemin="0"
                              aria-valuemax="100"
                            />
                          </div>
                        </div>
                      </td>
                      <td>
                        {lic.expiry_date ? (
                          <span style={{ fontSize: '0.82rem', color: 'var(--color-slate-700)' }}>
                            {lic.expiry_date}
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.8rem', color: 'var(--color-slate-400)' }}>Perpetual</span>
                        )}
                      </td>
                      <td>{getRenewalStatusBadge(lic.renewal_status)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => handleOpenAllocations(lic)}
                            title="Manage Seat Allocations"
                          >
                            <Users size={14} />
                            Allocations
                          </button>
                          <button
                            className="btn-icon"
                            onClick={() => handleOpenEdit(lic)}
                            title="Edit License"
                            aria-label={`Edit ${lic.software_name || lic.license_code || 'License'}`}
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            className="btn-icon danger"
                            onClick={() => handleDeleteLicense(lic)}
                            title="Delete License"
                            aria-label={`Delete ${lic.software_name || lic.license_code || 'License'}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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

      {/* CREATE / EDIT LICENSE MODAL */}
      {(showCreateModal || editingLicense) && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">
                {editingLicense ? `Edit License: ${editingLicense.software_name}` : 'Register Software License Agreement'}
              </h3>
              <button
                className="btn-icon"
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingLicense(null);
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
                    <label className="form-label" htmlFor="license-code-input">License Identifier / Code *</label>
                    <input
                      id="license-code-input"
                      type="text"
                      className="form-input"
                      placeholder="e.g. LIC-SLACK-ENT-2026"
                      value={formData.license_code}
                      onChange={(e) => setFormData({ ...formData, license_code: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="license-type-select">License Type *</label>
                    <select
                      id="license-type-select"
                      className="form-input"
                      value={formData.license_type}
                      onChange={(e) => setFormData({ ...formData, license_type: e.target.value })}
                    >
                      {LICENSE_TYPES.map((t) => (
                        <option key={t} value={t}>{t.replace('_', ' ')}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="software-name-input">Software / Product Title *</label>
                    <input
                      id="software-name-input"
                      type="text"
                      className="form-input"
                      placeholder="e.g. JetBrains All Products Pack"
                      value={formData.software_name}
                      onChange={(e) => setFormData({ ...formData, software_name: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="vendor-input">Vendor / Publisher *</label>
                    <input
                      id="vendor-input"
                      type="text"
                      className="form-input"
                      placeholder="e.g. JetBrains, Microsoft, Adobe"
                      value={formData.vendor}
                      onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="total-quantity-input">Total Purchased Seats *</label>
                    <input
                      id="total-quantity-input"
                      type="number"
                      min="1"
                      className="form-input"
                      value={formData.total_quantity}
                      onChange={(e) => setFormData({ ...formData, total_quantity: e.target.value })}
                      required
                    />
                    {editingLicense && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-slate-500)' }}>
                        Currently active allocations: {editingLicense.used_quantity} seats
                      </span>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="purchase-cost-input">Annual / Total Cost (₹ / $)</label>
                    <input
                      id="purchase-cost-input"
                      type="number"
                      step="0.01"
                      className="form-input"
                      placeholder="e.g. 145000.00"
                      value={formData.purchase_cost}
                      onChange={(e) => setFormData({ ...formData, purchase_cost: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="purchase-date-input">Purchase Date *</label>
                    <input
                      id="purchase-date-input"
                      type="date"
                      className="form-input"
                      value={formData.purchase_date}
                      onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="expiry-date-input">Renewal / Expiry Date</label>
                    <input
                      id="expiry-date-input"
                      type="date"
                      className="form-input"
                      value={formData.expiry_date}
                      onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="renewal-status-select">Renewal Status</label>
                  <select
                    id="renewal-status-select"
                    className="form-input"
                    value={formData.renewal_status}
                    onChange={(e) => setFormData({ ...formData, renewal_status: e.target.value })}
                  >
                    {RENEWAL_STATUSES.map((s) => (
                      <option key={s} value={s}>{s.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="notes-textarea">Notes & License Agreement Terms</label>
                  <textarea
                    id="notes-textarea"
                    className="form-input"
                    rows="2"
                    placeholder="e.g. Corporate volume license assigned across engineering and product"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingLicense(null);
                  }}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Saving...' : editingLicense ? 'Update License' : 'Register License'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ALLOCATION MANAGEMENT MODAL */}
      {allocatingLicense && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-content" style={{ maxWidth: '680px' }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Seat Allocations: {allocatingLicense.software_name}</h3>
                <div style={{ fontSize: '0.82rem', color: 'var(--color-slate-500)', marginTop: '2px' }}>
                  {allocatingLicense.vendor} &bull; <span style={{ fontFamily: 'monospace' }}>{allocatingLicense.license_code}</span>
                </div>
              </div>
              <button className="btn-icon" onClick={() => setAllocatingLicense(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              {/* Capacity Summary Box */}
              <div style={{ backgroundColor: 'var(--color-slate-50)', padding: '14px 18px', borderRadius: 'var(--radius-md)', marginBottom: '20px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--color-slate-800)' }}>
                    Capacity Status: {allocatingLicense.used_quantity} of {allocatingLicense.total_quantity} seats allocated
                  </span>
                  <span
                    className={`status-pill ${(allocatingLicense.total_quantity - allocatingLicense.used_quantity) === 0 ? 'status-pill-terminated' : 'status-pill-available'}`}
                    style={{ fontSize: '0.74rem' }}
                  >
                    {allocatingLicense.total_quantity - allocatingLicense.used_quantity} seats available
                  </span>
                </div>
                <div className="progress-track" style={{ height: '8px' }}>
                  <div
                    className="progress-bar"
                    style={{ width: `${Math.min(100, Math.round((allocatingLicense.used_quantity / allocatingLicense.total_quantity) * 100))}%` }}
                  />
                </div>
              </div>

              {/* Allocation Tabs */}
              <div className="tab-nav">
                <button
                  className={`tab-btn ${allocationTab === 'active' ? 'active' : ''}`}
                  onClick={() => setAllocationTab('active')}
                >
                  Active Allocations ({activeAllocations.length})
                </button>
                <button
                  className={`tab-btn ${allocationTab === 'history' ? 'active' : ''}`}
                  onClick={() => setAllocationTab('history')}
                >
                  Revoked History ({revokedAllocations.length})
                </button>
              </div>

              {allocError && (
                <div className="alert-banner alert-danger" style={{ marginBottom: '16px' }}>
                  <AlertCircle size={18} />
                  <span>{allocError}</span>
                </div>
              )}

              {/* Active Tab View */}
              {allocationTab === 'active' && (
                <div>
                  {/* Allocate Seat Form */}
                  <form onSubmit={handleAllocateSeat} style={{ marginBottom: '24px', backgroundColor: '#ffffff', padding: '16px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
                    <h4 style={{ fontSize: '0.92rem', fontWeight: 600, marginBottom: '12px', color: 'var(--color-slate-800)' }}>
                      Allocate Seat to Employee
                    </h4>

                    {(allocatingLicense.total_quantity - allocatingLicense.used_quantity) <= 0 ? (
                      <div className="alert-banner alert-info" style={{ marginBottom: '12px' }}>
                        <Info size={18} />
                        <span>All purchased seats are allocated. Revoke an active seat before adding more users.</span>
                      </div>
                    ) : (
                      <>
                        <div className="form-group">
                          <label className="form-label" htmlFor="alloc-employee-select">Select Active Employee *</label>
                          <select
                            id="alloc-employee-select"
                            className="form-input"
                            value={allocEmployeeId}
                            onChange={(e) => setAllocEmployeeId(e.target.value)}
                            required
                          >
                            <option value="">-- Choose an employee --</option>
                            {employees.map((emp) => (
                              <option key={emp.id} value={emp.id}>
                                {emp.full_name} ({emp.employee_code}) &bull; {emp.department}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="form-group">
                          <label className="form-label" htmlFor="alloc-notes-input">Allocation Notes (Optional)</label>
                          <input
                            id="alloc-notes-input"
                            type="text"
                            className="form-input"
                            placeholder="e.g. Required for mobile backend development sprint"
                            value={allocNotes}
                            onChange={(e) => setAllocNotes(e.target.value)}
                          />
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <button
                            type="submit"
                            className="btn btn-primary btn-sm"
                            disabled={allocSubmitting}
                          >
                            <UserCheck size={14} />
                            {allocSubmitting ? 'Allocating...' : 'Confirm Allocation'}
                          </button>
                        </div>
                      </>
                    )}
                  </form>

                  {/* Active Allocations List */}
                  {allocationsLoading ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-slate-500)' }}>
                      <div className="spinner" style={{ margin: '0 auto 8px' }}></div>
                      Loading active seat allocations...
                    </div>
                  ) : activeAllocations.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-slate-500)' }}>
                      <Users size={32} color="var(--color-slate-300)" style={{ margin: '0 auto 8px' }} />
                      <p>No active seat allocations currently recorded.</p>
                    </div>
                  ) : (
                    <div className="table-responsive">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Employee</th>
                            <th>Department</th>
                            <th>Allocated Date</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeAllocations.map((alloc) => (
                            <tr key={alloc.id}>
                              <td>
                                <div style={{ fontWeight: 600, color: 'var(--color-slate-800)' }}>
                                  {alloc.employee_name || 'Assigned to Asset'}
                                </div>
                                {alloc.employee_code && (
                                  <div style={{ fontSize: '0.75rem', color: 'var(--color-slate-500)' }}>
                                    {alloc.employee_code}
                                  </div>
                                )}
                              </td>
                              <td>
                                <span style={{ fontSize: '0.8rem', color: 'var(--color-slate-600)' }}>
                                  {alloc.employee_department || '—'}
                                </span>
                              </td>
                              <td>
                                <span style={{ fontSize: '0.78rem', color: 'var(--color-slate-500)' }}>
                                  {new Date(alloc.allocated_at).toLocaleDateString()}
                                </span>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <button
                                  className="btn btn-outline btn-sm"
                                  onClick={() => handleRevokeAllocation(alloc)}
                                  disabled={allocSubmitting}
                                  title="Revoke seat"
                                >
                                  <RotateCcw size={12} />
                                  Revoke
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* History Tab View */}
              {allocationTab === 'history' && (
                <div>
                  {revokedAllocations.length === 0 ? (
                    <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-slate-500)' }}>
                      <Clock size={32} color="var(--color-slate-300)" style={{ margin: '0 auto 8px' }} />
                      <p>No revoked allocation records found for this license.</p>
                    </div>
                  ) : (
                    <div className="table-responsive">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Prior Custodian</th>
                            <th>Department</th>
                            <th>Allocated On</th>
                            <th>Revoked On</th>
                          </tr>
                        </thead>
                        <tbody>
                          {revokedAllocations.map((alloc) => (
                            <tr key={alloc.id}>
                              <td>
                                <div style={{ fontWeight: 600, color: 'var(--color-slate-800)' }}>
                                  {alloc.employee_name || 'Hardware Asset'}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--color-slate-500)' }}>
                                  {alloc.employee_code}
                                </div>
                              </td>
                              <td>
                                <span style={{ fontSize: '0.8rem', color: 'var(--color-slate-600)' }}>
                                  {alloc.employee_department || '—'}
                                </span>
                              </td>
                              <td>
                                <span style={{ fontSize: '0.78rem', color: 'var(--color-slate-500)' }}>
                                  {new Date(alloc.allocated_at).toLocaleDateString()}
                                </span>
                              </td>
                              <td>
                                <span className="status-pill status-pill-retired" style={{ fontSize: '0.72rem' }}>
                                  {new Date(alloc.revoked_at).toLocaleDateString()}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setAllocatingLicense(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
