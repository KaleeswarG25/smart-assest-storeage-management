import React, { useState, useEffect, useCallback } from 'react';
import {
  FileBarChart,
  AlertTriangle,
  Download,
  Search,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  Shield,
  KeyRound,
  Laptop,
  Users,
  ChevronDown,
  ChevronUp,
  X
} from 'lucide-react';
import { expiryApi } from '../api/expiryApi';
import { reportApi } from '../api/reportApi';

const EXPIRY_TABS = [
  { id: 'license_expiry', label: 'License Expiry', icon: KeyRound },
  { id: 'warranty_expiry', label: 'Warranty Expiry', icon: Shield },
  { id: 'reports', label: 'Reports & Export', icon: FileBarChart }
];

const REPORT_TYPES = [
  { type: 'asset_inventory', label: 'Asset Inventory', description: 'Complete hardware asset inventory with assignment status', icon: Laptop },
  { type: 'assigned_assets', label: 'Assigned Assets', description: 'Currently assigned assets with employee details', icon: Users },
  { type: 'assignment_history', label: 'Assignment History', description: 'Chronological asset assignment and return history', icon: Clock },
  { type: 'license_inventory', label: 'License Inventory', description: 'Complete software license inventory', icon: KeyRound },
  { type: 'seat_utilization', label: 'Seat Utilization', description: 'License seat utilization percentages', icon: FileBarChart },
  { type: 'expired_licenses', label: 'Expired Licenses', description: 'Licenses with expired dates', icon: AlertTriangle },
  { type: 'expiring_licenses', label: 'Expiring Licenses', description: 'Licenses expiring within 30 days', icon: AlertCircle }
];

export function ExpiryBucketBadge({ bucket }) {
  const styles = {
    EXPIRED: { bg: 'var(--color-danger-bg)', color: 'var(--color-danger-text)', border: 'var(--color-danger-border)', label: 'Expired' },
    EXPIRING_7_DAYS: { bg: 'var(--color-danger-bg)', color: 'var(--color-danger-text)', border: 'var(--color-danger-border)', label: '≤ 7 Days' },
    EXPIRING_30_DAYS: { bg: 'var(--color-warning-bg)', color: 'var(--color-warning-text)', border: 'var(--color-warning-border)', label: '≤ 30 Days' },
    VALID: { bg: 'var(--color-success-bg)', color: 'var(--color-success-text)', border: 'var(--color-success-border)', label: 'Valid' },
    NO_EXPIRY: { bg: 'var(--color-info-bg)', color: 'var(--color-info-text)', border: 'var(--color-info-border)', label: 'No Expiry' }
  };
  const style = styles[bucket] || styles.VALID;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '3px 10px', borderRadius: '12px', fontSize: '0.76rem', fontWeight: 600,
      backgroundColor: style.bg, color: style.color, border: `1px solid ${style.border}`
    }}>
      {style.label}
    </span>
  );
}

export function SummaryCard({ label, value, color, icon: Icon, onClick, active }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '16px 12px', borderRadius: 'var(--radius-md)',
        backgroundColor: active ? color + '20' : 'var(--bg-card)',
        border: active ? `2px solid ${color}` : '1px solid var(--border-subtle)',
        cursor: 'pointer', transition: 'all 0.2s ease',
        minWidth: '120px', flex: '1', boxShadow: active ? 'var(--shadow-sm)' : 'none'
      }}
    >
      <Icon size={20} color={color} style={{ marginBottom: '6px' }} />
      <span style={{ fontSize: '1.5rem', fontWeight: 700, color }}>{value}</span>
      <span style={{ fontSize: '0.76rem', color: 'var(--color-slate-500)', marginTop: '4px', textAlign: 'center' }}>{label}</span>
    </button>
  );
}

export function LicenseExpiryTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeBucket, setActiveBucket] = useState(null);
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await expiryApi.getLicenseExpiry({ bucket: activeBucket, search: search || undefined });
      setData(result);
    } catch (err) {
      setError(err.message || 'Failed to load license expiry data');
    } finally {
      setLoading(false);
    }
  }, [activeBucket, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleBucketClick = (bucket) => {
    setActiveBucket(activeBucket === bucket ? null : bucket);
  };

  if (loading && !data) {
    return <div style={{ textAlign: 'center', padding: '48px', color: 'var(--color-slate-500)' }}>Loading expiry data...</div>;
  }

  return (
    <div>
      {error && (
        <div className="alert-banner alert-danger" style={{ marginBottom: '20px' }}>
          <AlertCircle size={18} />
          <span>{error}</span>
          <button className="btn btn-outline btn-sm" onClick={fetchData}>Retry</button>
        </div>
      )}

      {/* Search Bar */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-slate-400)' }} />
          <input
            type="text"
            placeholder="Search licenses by name, vendor, or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="form-input"
            style={{ paddingLeft: '36px', width: '100%' }}
          />
        </div>
        <button className="btn btn-outline btn-sm" onClick={fetchData} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spinner' : ''} />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      {data?.summary && (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
          <SummaryCard label="Expired" value={data.summary.expired} color="#ef4444"
            icon={AlertTriangle} onClick={() => handleBucketClick('EXPIRED')} active={activeBucket === 'EXPIRED'} />
          <SummaryCard label="≤ 7 Days" value={data.summary.expiring_7_days} color="#f97316"
            icon={AlertCircle} onClick={() => handleBucketClick('EXPIRING_7_DAYS')} active={activeBucket === 'EXPIRING_7_DAYS'} />
          <SummaryCard label="≤ 30 Days" value={data.summary.expiring_30_days} color="#eab308"
            icon={Clock} onClick={() => handleBucketClick('EXPIRING_30_DAYS')} active={activeBucket === 'EXPIRING_30_DAYS'} />
          <SummaryCard label="Valid" value={data.summary.valid} color="#10b981"
            icon={CheckCircle2} onClick={() => handleBucketClick('VALID')} active={activeBucket === 'VALID'} />
          <SummaryCard label="No Expiry" value={data.summary.no_expiry} color="#3b82f6"
            icon={Shield} onClick={() => handleBucketClick('NO_EXPIRY')} active={activeBucket === 'NO_EXPIRY'} />
        </div>
      )}

      {/* License Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>License Code</th>
                <th>Software</th>
                <th>Vendor</th>
                <th>Type</th>
                <th>Expiry Date</th>
                <th>Days Remaining</th>
                <th>Status</th>
                <th>Seats</th>
              </tr>
            </thead>
            <tbody>
              {data?.licenses?.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--color-slate-500)', padding: '32px' }}>
                  {activeBucket ? `No licenses in the "${activeBucket.replace(/_/g, ' ').toLowerCase()}" category.` : 'No licenses found.'}
                </td></tr>
              )}
              {data?.licenses?.map(l => (
                <tr key={l.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{l.license_code}</td>
                  <td style={{ fontWeight: 600 }}>{l.software_name}</td>
                  <td>{l.vendor}</td>
                  <td><span className="metric-badge badge-info" style={{ fontSize: '0.72rem' }}>{l.license_type}</span></td>
                  <td>{l.expiry_date || '—'}</td>
                  <td style={{ fontWeight: 600, color: l.days_remaining !== null && l.days_remaining < 0 ? 'var(--color-danger-text)' : l.days_remaining !== null && l.days_remaining <= 7 ? '#f97316' : l.days_remaining !== null && l.days_remaining <= 30 ? '#eab308' : 'var(--color-success-text)' }}>
                    {l.days_remaining !== null ? (l.days_remaining < 0 ? `${Math.abs(l.days_remaining)} overdue` : `${l.days_remaining} days`) : '—'}
                  </td>
                  <td><ExpiryBucketBadge bucket={l.expiry_bucket} /></td>
                  <td>{l.used_quantity}/{l.total_quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function WarrantyExpiryTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeBucket, setActiveBucket] = useState(null);
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await expiryApi.getWarrantyExpiry({ bucket: activeBucket, search: search || undefined });
      setData(result);
    } catch (err) {
      setError(err.message || 'Failed to load warranty expiry data');
    } finally {
      setLoading(false);
    }
  }, [activeBucket, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleBucketClick = (bucket) => {
    setActiveBucket(activeBucket === bucket ? null : bucket);
  };

  if (loading && !data) {
    return <div style={{ textAlign: 'center', padding: '48px', color: 'var(--color-slate-500)' }}>Loading warranty data...</div>;
  }

  return (
    <div>
      {error && (
        <div className="alert-banner alert-danger" style={{ marginBottom: '20px' }}>
          <AlertCircle size={18} />
          <span>{error}</span>
          <button className="btn btn-outline btn-sm" onClick={fetchData}>Retry</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-slate-400)' }} />
          <input
            type="text"
            placeholder="Search assets by name, tag, or manufacturer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="form-input"
            style={{ paddingLeft: '36px', width: '100%' }}
          />
        </div>
        <button className="btn btn-outline btn-sm" onClick={fetchData} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spinner' : ''} />
          Refresh
        </button>
      </div>

      {data?.summary && (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
          <SummaryCard label="Expired" value={data.summary.expired} color="#ef4444"
            icon={AlertTriangle} onClick={() => handleBucketClick('EXPIRED')} active={activeBucket === 'EXPIRED'} />
          <SummaryCard label="≤ 7 Days" value={data.summary.expiring_7_days} color="#f97316"
            icon={AlertCircle} onClick={() => handleBucketClick('EXPIRING_7_DAYS')} active={activeBucket === 'EXPIRING_7_DAYS'} />
          <SummaryCard label="≤ 30 Days" value={data.summary.expiring_30_days} color="#eab308"
            icon={Clock} onClick={() => handleBucketClick('EXPIRING_30_DAYS')} active={activeBucket === 'EXPIRING_30_DAYS'} />
          <SummaryCard label="Valid" value={data.summary.valid} color="#10b981"
            icon={CheckCircle2} onClick={() => handleBucketClick('VALID')} active={activeBucket === 'VALID'} />
          <SummaryCard label="No Warranty" value={data.summary.no_expiry} color="#3b82f6"
            icon={Shield} onClick={() => handleBucketClick('NO_EXPIRY')} active={activeBucket === 'NO_EXPIRY'} />
        </div>
      )}

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Asset Tag</th>
                <th>Name</th>
                <th>Category</th>
                <th>Status</th>
                <th>Warranty Expiry</th>
                <th>Days Remaining</th>
                <th>Warranty Status</th>
                <th>Assigned To</th>
              </tr>
            </thead>
            <tbody>
              {data?.assets?.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--color-slate-500)', padding: '32px' }}>
                  {activeBucket ? `No assets in the "${activeBucket.replace(/_/g, ' ').toLowerCase()}" category.` : 'No assets found.'}
                </td></tr>
              )}
              {data?.assets?.map(a => (
                <tr key={a.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{a.asset_tag}</td>
                  <td style={{ fontWeight: 600 }}>{a.name}</td>
                  <td><span className="metric-badge badge-info" style={{ fontSize: '0.72rem' }}>{a.category}</span></td>
                  <td>{a.status}</td>
                  <td>{a.warranty_expiry || '—'}</td>
                  <td style={{ fontWeight: 600, color: a.warranty_days_remaining !== null && a.warranty_days_remaining < 0 ? 'var(--color-danger-text)' : a.warranty_days_remaining !== null && a.warranty_days_remaining <= 7 ? '#f97316' : a.warranty_days_remaining !== null && a.warranty_days_remaining <= 30 ? '#eab308' : 'var(--color-success-text)' }}>
                    {a.warranty_days_remaining !== null ? (a.warranty_days_remaining < 0 ? `${Math.abs(a.warranty_days_remaining)} overdue` : `${a.warranty_days_remaining} days`) : '—'}
                  </td>
                  <td><ExpiryBucketBadge bucket={a.warranty_bucket} /></td>
                  <td>{a.assigned_employee_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function ReportsExportTab() {
  const [downloading, setDownloading] = useState(null);
  const [previewType, setPreviewType] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);

  const handleDownload = async (type) => {
    try {
      setDownloading(type);
      await reportApi.downloadCsv(type);
    } catch (err) {
      alert(err.message || 'CSV download failed');
    } finally {
      setDownloading(null);
    }
  };

  const handlePreview = async (type) => {
    if (previewType === type) {
      setPreviewType(null);
      setPreviewData(null);
      return;
    }
    try {
      setPreviewType(type);
      setPreviewLoading(true);
      setPreviewError(null);
      const result = await reportApi.getReport(type);
      setPreviewData(result);
    } catch (err) {
      setPreviewError(err.message || 'Failed to load report');
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {REPORT_TYPES.map(report => {
          const Icon = report.icon;
          const isExpanded = previewType === report.type;
          return (
            <div key={report.type} className="card" style={{ overflow: 'hidden' }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 20px', gap: '12px', flexWrap: 'wrap'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '200px' }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-primary-50)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <Icon size={18} color="var(--color-primary-600)" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--color-slate-800)' }}>{report.label}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-slate-500)' }}>{report.description}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => handlePreview(report.type)}
                    style={{ minWidth: '90px' }}
                  >
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {isExpanded ? 'Collapse' : 'Preview'}
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleDownload(report.type)}
                    disabled={downloading === report.type}
                    style={{ minWidth: '120px' }}
                  >
                    <Download size={14} />
                    {downloading === report.type ? 'Downloading...' : 'Download CSV'}
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '16px 20px', backgroundColor: 'var(--color-slate-50)' }}>
                  {previewLoading && <div style={{ color: 'var(--color-slate-500)', padding: '16px', textAlign: 'center' }}>Loading report data...</div>}
                  {previewError && (
                    <div className="alert-banner alert-danger">
                      <AlertCircle size={16} />
                      <span>{previewError}</span>
                    </div>
                  )}
                  {previewData && !previewLoading && (
                    <div>
                      <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <span style={{ fontSize: '0.82rem', color: 'var(--color-slate-600)' }}>
                          {previewData.record_count} records • Generated: {new Date(previewData.generated_at).toLocaleString()}
                        </span>
                      </div>
                      <div style={{ overflowX: 'auto', maxHeight: '320px', overflowY: 'auto' }}>
                        {previewData.records.length === 0 ? (
                          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-slate-500)' }}>No records to display.</div>
                        ) : (
                          <table className="data-table" style={{ fontSize: '0.78rem' }}>
                            <thead>
                              <tr>
                                {Object.keys(previewData.records[0]).slice(0, 8).map(key => (
                                  <th key={key} style={{ whiteSpace: 'nowrap', textTransform: 'capitalize' }}>
                                    {key.replace(/_/g, ' ')}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {previewData.records.slice(0, 10).map((row, idx) => (
                                <tr key={idx}>
                                  {Object.keys(previewData.records[0]).slice(0, 8).map(key => (
                                    <td key={key} style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {row[key] !== null && row[key] !== undefined ? String(row[key]) : '—'}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        {previewData.records.length > 10 && (
                          <div style={{ padding: '8px', textAlign: 'center', fontSize: '0.78rem', color: 'var(--color-slate-500)' }}>
                            Showing first 10 of {previewData.records.length} records. Download CSV for full data.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ReportsPage() {
  const [activeTab, setActiveTab] = useState('license_expiry');

  return (
    <div>
      {/* Page Header */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--color-slate-900)', marginBottom: '6px' }}>
          Expiry Alerts, Reports & CSV Export
        </h2>
        <p style={{ fontSize: '0.88rem', color: 'var(--color-slate-500)' }}>
          Monitor license and warranty expirations, view classified alerts, and download compliance-ready CSV reports.
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="tab-bar" style={{ marginBottom: '24px' }}>
        {EXPIRY_TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'license_expiry' && <LicenseExpiryTab />}
      {activeTab === 'warranty_expiry' && <WarrantyExpiryTab />}
      {activeTab === 'reports' && <ReportsExportTab />}
    </div>
  );
}

export default ReportsPage;
