import React, { useState, useEffect, useCallback } from 'react';
import {
  Laptop,
  CheckCircle2,
  Clock,
  KeyRound,
  AlertTriangle,
  Server,
  Users,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { healthApi } from '../api/healthApi';
import { assetApi } from '../api/assetApi';
import { employeeApi } from '../api/employeeApi';
import { licenseApi } from '../api/licenseApi';
import { expiryApi } from '../api/expiryApi';

export function DashboardPage() {
  const { user } = useAuth();

  // Health state
  const [healthData, setHealthData] = useState(null);
  const [healthLoading, setHealthLoading] = useState(true);

  // Asset, Employee & License metrics state
  const [metrics, setMetrics] = useState({
    totalAssets: null,
    assignedAssets: null,
    availableAssets: null,
    totalEmployees: null,
    totalLicenses: null,
    totalPurchasedSeats: null,
    totalAllocatedSeats: null,
    nearExpiryLicenses: null
  });
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState(null);

  // Fetch health
  useEffect(() => {
    let isMounted = true;
    async function fetchHealth() {
      try {
        setHealthLoading(true);
        const data = await healthApi.getHealth();
        if (isMounted) setHealthData(data);
      } catch (err) {
        if (isMounted) {
          setHealthData({
            status: 'DOWN',
            healthy: false,
            database: { status: 'DISCONNECTED', engine: 'SQLite 3' }
          });
        }
      } finally {
        if (isMounted) setHealthLoading(false);
      }
    }

    fetchHealth();
    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch real inventory, employee, and license metrics
  const fetchMetrics = useCallback(async () => {
    try {
      setMetricsLoading(true);
      setMetricsError(null);

      const [assetRes, empRes, licRes, expirySummary] = await Promise.all([
        assetApi.list({ limit: 1000 }),
        employeeApi.list({ limit: 1 }),
        licenseApi.list({ limit: 1000 }),
        expiryApi.getDashboardSummary().catch(() => null)
      ]);

      const allAssets = assetRes.assets || [];
      const totalAssets = assetRes.pagination?.total ?? allAssets.length;
      const assignedAssets = allAssets.filter(a => a.status === 'ASSIGNED').length;
      const availableAssets = allAssets.filter(a => a.status === 'AVAILABLE').length;
      const totalEmployees = empRes.pagination?.total ?? (empRes.employees ? empRes.employees.length : 0);

      const allLicenses = licRes.licenses || [];
      const totalLicenses = licRes.pagination?.total ?? allLicenses.length;
      const totalPurchasedSeats = allLicenses.reduce((sum, l) => sum + (l.total_quantity || 0), 0);
      const totalAllocatedSeats = allLicenses.reduce((sum, l) => sum + (l.used_quantity || 0), 0);

      const nearExpiryLicenses = expirySummary ? expirySummary.licenses.near_expiry_total : 0;

      setMetrics({
        totalAssets,
        assignedAssets,
        availableAssets,
        totalEmployees,
        totalLicenses,
        totalPurchasedSeats,
        totalAllocatedSeats,
        nearExpiryLicenses
      });
    } catch (err) {
      setMetricsError(err.message || 'Unable to retrieve inventory metrics from backend.');
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  return (
    <div className="dashboard-container">
      {/* Welcome Banner */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-slate-900)' }}>
          Welcome back, {user?.fullName || user?.full_name || user?.username || 'Administrator'}
        </h2>
      </div>

      {/* Metrics Section Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--color-slate-900)' }}>
          Summary
          <span style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}>
            System Metrics & Inventory Summary
          </span>
        </h3>
        <button
          className="btn btn-outline btn-sm"
          onClick={fetchMetrics}
          disabled={metricsLoading}
          title="Refresh metrics"
        >
          <RefreshCw size={14} className={metricsLoading ? 'spinner' : ''} />
          Refresh Metrics
        </button>
      </div>

      {/* Metrics Error State */}
      {metricsError && (
        <div className="alert-banner alert-danger" style={{ marginBottom: '24px' }}>
          <AlertCircle size={20} />
          <div style={{ flex: 1 }}>
            <strong>Unable to load inventory metrics:</strong> {metricsError}
          </div>
          <button className="btn btn-outline btn-sm" onClick={fetchMetrics}>
            Retry
          </button>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="metrics-grid">
        {/* Total Hardware Assets */}
        <div className="metric-card">
          <div className="metric-card-top">
            <span className="metric-label">Total Hardware Assets</span>
            <div className="metric-icon-box">
              <Laptop size={20} />
            </div>
          </div>
          <div className="metric-value-box">
            {metricsLoading ? (
              <span className="metric-value-placeholder">...</span>
            ) : metricsError ? (
              <span className="metric-value-placeholder" style={{ color: 'var(--color-danger-text)' }}>Unavailable</span>
            ) : (
              <span style={{ fontSize: '1.85rem', fontWeight: 700, color: 'var(--color-slate-900)' }}>
                {metrics.totalAssets}
              </span>
            )}
          </div>
          <div>
            <span className="metric-badge badge-success">Live Module 4 API</span>
            <p style={{ fontSize: '0.78rem', color: 'var(--color-slate-500)', marginTop: '8px' }}>
              Total registered hardware inventory
            </p>
          </div>
        </div>

        {/* Assigned Assets */}
        <div className="metric-card">
          <div className="metric-card-top">
            <span className="metric-label">Assigned Assets</span>
            <div className="metric-icon-box">
              <CheckCircle2 size={20} />
            </div>
          </div>
          <div className="metric-value-box">
            {metricsLoading ? (
              <span className="metric-value-placeholder">...</span>
            ) : metricsError ? (
              <span className="metric-value-placeholder" style={{ color: 'var(--color-danger-text)' }}>Unavailable</span>
            ) : (
              <span style={{ fontSize: '1.85rem', fontWeight: 700, color: 'var(--color-primary-600)' }}>
                {metrics.assignedAssets}
              </span>
            )}
          </div>
          <div>
            <span className="metric-badge badge-success">Live Module 4 API</span>
            <p style={{ fontSize: '0.78rem', color: 'var(--color-slate-500)', marginTop: '8px' }}>
              Active employee custody tracking
            </p>
          </div>
        </div>

        {/* Available Assets */}
        <div className="metric-card">
          <div className="metric-card-top">
            <span className="metric-label">Available Assets</span>
            <div className="metric-icon-box">
              <Clock size={20} />
            </div>
          </div>
          <div className="metric-value-box">
            {metricsLoading ? (
              <span className="metric-value-placeholder">...</span>
            ) : metricsError ? (
              <span className="metric-value-placeholder" style={{ color: 'var(--color-danger-text)' }}>Unavailable</span>
            ) : (
              <span style={{ fontSize: '1.85rem', fontWeight: 700, color: 'var(--color-success-text)' }}>
                {metrics.availableAssets}
              </span>
            )}
          </div>
          <div>
            <span className="metric-badge badge-success">Live Module 4 API</span>
            <p style={{ fontSize: '0.78rem', color: 'var(--color-slate-500)', marginTop: '8px' }}>
              Inventory ready for employee issuance
            </p>
          </div>
        </div>

        {/* Total Employees */}
        <div className="metric-card">
          <div className="metric-card-top">
            <span className="metric-label">Total Employees</span>
            <div className="metric-icon-box">
              <Users size={20} />
            </div>
          </div>
          <div className="metric-value-box">
            {metricsLoading ? (
              <span className="metric-value-placeholder">...</span>
            ) : metricsError ? (
              <span className="metric-value-placeholder" style={{ color: 'var(--color-danger-text)' }}>Unavailable</span>
            ) : (
              <span style={{ fontSize: '1.85rem', fontWeight: 700, color: 'var(--color-slate-900)' }}>
                {metrics.totalEmployees}
              </span>
            )}
          </div>
          <div>
            <span className="metric-badge badge-success">Live Module 4 API</span>
            <p style={{ fontSize: '0.78rem', color: 'var(--color-slate-500)', marginTop: '8px' }}>
              Registered personnel in directory
            </p>
          </div>
        </div>

        {/* Software Licenses - Live Module 5 */}
        <div className="metric-card">
          <div className="metric-card-top">
            <span className="metric-label">Software Licenses</span>
            <div className="metric-icon-box">
              <KeyRound size={20} />
            </div>
          </div>
          <div className="metric-value-box">
            {metricsLoading ? (
              <span className="metric-value-placeholder">...</span>
            ) : metricsError ? (
              <span className="metric-value-placeholder" style={{ color: 'var(--color-danger-text)' }}>Unavailable</span>
            ) : (
              <span style={{ fontSize: '1.85rem', fontWeight: 700, color: 'var(--color-slate-900)' }}>
                {metrics.totalLicenses}
              </span>
            )}
          </div>
          <div>
            <span className="metric-badge badge-success">Live Module 5 API</span>
            <p style={{ fontSize: '0.78rem', color: 'var(--color-slate-500)', marginTop: '8px' }}>
              {metricsLoading || metricsError ? (
                'Total seat capacity & allocations'
              ) : (
                `${metrics.totalAllocatedSeats} of ${metrics.totalPurchasedSeats} seats allocated`
              )}
            </p>
          </div>
        </div>

        {/* Licenses Near Expiry - Live Module 6 */}
        <div className="metric-card">
          <div className="metric-card-top">
            <span className="metric-label">Licenses Near Expiry</span>
            <div className="metric-icon-box">
              <AlertTriangle size={20} />
            </div>
          </div>
          <div className="metric-value-box">
            {metricsLoading ? (
              <span className="metric-value-placeholder">...</span>
            ) : metricsError ? (
              <span className="metric-value-placeholder" style={{ color: 'var(--color-danger-text)' }}>Unavailable</span>
            ) : (
              <span style={{ fontSize: '1.85rem', fontWeight: 700, color: metrics.nearExpiryLicenses > 0 ? 'var(--color-warning-text)' : 'var(--color-success-text)' }}>
                {metrics.nearExpiryLicenses}
              </span>
            )}
          </div>
          <div>
            <span className="metric-badge badge-success">Live Module 6 API</span>
            <p style={{ fontSize: '0.78rem', color: 'var(--color-slate-500)', marginTop: '8px' }}>
              Expired or expiring within 30 days
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
