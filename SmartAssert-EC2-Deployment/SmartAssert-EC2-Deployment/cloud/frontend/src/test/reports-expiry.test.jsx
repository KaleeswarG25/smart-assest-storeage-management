import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import ReportsPage from '../pages/ReportsPage';
import { DashboardPage } from '../pages/DashboardPage';
import { expiryApi } from '../api/expiryApi';
import { reportApi } from '../api/reportApi';
import { assetApi } from '../api/assetApi';
import { employeeApi } from '../api/employeeApi';
import { licenseApi } from '../api/licenseApi';
import { healthApi } from '../api/healthApi';

const MOCK_ADMIN_USER = {
  id: 1,
  username: 'admin',
  full_name: 'IT Administrator',
  role: 'SUPERADMIN'
};

const renderWithAuth = (ui) => {
  return render(
    <AuthContext.Provider value={{ user: MOCK_ADMIN_USER, isAuthenticated: true, loading: false }}>
      <MemoryRouter>
        {ui}
      </MemoryRouter>
    </AuthContext.Provider>
  );
};

describe('Module 6 — Expiry Alerts, Reporting & CSV Export Tests', () => {
  const mockLicenseExpiry = {
    summary: {
      expired: 1,
      expiring_7_days: 1,
      expiring_30_days: 1,
      valid: 2,
      no_expiry: 1,
      near_expiry_total: 2,
      total_with_expiry: 5,
      total_licenses: 6
    },
    licenses: [
      {
        id: 1,
        software_name: 'JetBrains All Products Pack',
        vendor: 'JetBrains s.r.o.',
        license_code: 'LIC-JB-ALL-2026',
        category: 'DEVELOPER_TOOLS',
        expiry_date: '2026-10-10',
        total_quantity: 10,
        used_quantity: 5,
        available_quantity: 5,
        expiry_bucket: 'EXPIRED',
        days_remaining: -4,
        is_expired: true,
        urgency: 'expired'
      },
      {
        id: 2,
        software_name: 'Microsoft 365 E5 Enterprise',
        vendor: 'Microsoft Corporation',
        license_code: 'LIC-MS-M365-E5',
        category: 'PRODUCTIVITY',
        expiry_date: '2026-10-18',
        total_quantity: 50,
        used_quantity: 35,
        available_quantity: 15,
        expiry_bucket: 'EXPIRING_7_DAYS',
        days_remaining: 4,
        is_expired: false,
        urgency: 'critical'
      },
      {
        id: 3,
        software_name: 'Adobe Creative Cloud',
        vendor: 'Adobe Inc.',
        license_code: 'LIC-AD-CC-2026',
        category: 'CREATIVE_DESIGN',
        expiry_date: '2026-10-30',
        total_quantity: 15,
        used_quantity: 10,
        available_quantity: 5,
        expiry_bucket: 'EXPIRING_30_DAYS',
        days_remaining: 16,
        is_expired: false,
        urgency: 'warning'
      }
    ]
  };

  const mockWarrantyExpiry = {
    summary: {
      expired: 1,
      expiring_7_days: 0,
      expiring_30_days: 1,
      valid: 3,
      no_expiry: 1,
      total_assets: 6
    },
    assets: [
      {
        id: 1,
        asset_tag: 'AST-HW-1001',
        name: 'Dell XPS 15 9530',
        category: 'LAPTOP',
        status: 'ASSIGNED',
        warranty_expiry: '2026-08-01',
        warranty_bucket: 'EXPIRED',
        warranty_days_remaining: -74,
        is_expired: true,
        urgency: 'expired'
      },
      {
        id: 2,
        asset_tag: 'AST-HW-1002',
        name: 'Apple MacBook Pro 16" M3',
        category: 'LAPTOP',
        status: 'AVAILABLE',
        warranty_expiry: '2026-11-01',
        warranty_bucket: 'EXPIRING_30_DAYS',
        warranty_days_remaining: 18,
        is_expired: false,
        urgency: 'warning'
      }
    ]
  };

  const mockReportTypes = [
    { type: 'asset_inventory', label: 'Asset Inventory', description: 'Complete inventory' },
    { type: 'seat_utilization', label: 'Seat Utilization', description: 'License allocation analysis' }
  ];

  const mockAssetReport = {
    report_type: 'asset_inventory',
    title: 'Complete IT Asset Inventory',
    record_count: 2,
    generated_at: '2026-10-14T01:00:00Z',
    records: [
      {
        asset_tag: 'AST-HW-1001',
        asset_name: 'Dell XPS 15 9530',
        category: 'LAPTOP',
        status: 'ASSIGNED',
        assigned_to: 'Rahul Sharma',
        department: 'ENGINEERING'
      },
      {
        asset_tag: 'AST-HW-1002',
        asset_name: 'MacBook Pro 16"',
        category: 'LAPTOP',
        status: 'AVAILABLE',
        assigned_to: 'Unassigned',
        department: 'N/A'
      }
    ]
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(expiryApi, 'getLicenseExpiry').mockImplementation((params = {}) => {
      let filtered = mockLicenseExpiry.licenses;
      if (params.search) {
        const q = params.search.toLowerCase();
        filtered = filtered.filter(l =>
          l.software_name.toLowerCase().includes(q) ||
          l.vendor.toLowerCase().includes(q) ||
          l.license_code.toLowerCase().includes(q)
        );
      }
      if (params.bucket) {
        filtered = filtered.filter(l => l.expiry_bucket === params.bucket);
      }
      return Promise.resolve({
        summary: mockLicenseExpiry.summary,
        licenses: filtered
      });
    });
    vi.spyOn(expiryApi, 'getWarrantyExpiry').mockResolvedValue(mockWarrantyExpiry);
    vi.spyOn(reportApi, 'listTypes').mockResolvedValue(mockReportTypes);
    vi.spyOn(reportApi, 'getReport').mockResolvedValue(mockAssetReport);
    vi.spyOn(reportApi, 'downloadCsv').mockResolvedValue({ success: true, filename: 'test.csv' });
  });

  it('1. Reports page renders with all three main tabs and header', async () => {
    renderWithAuth(<ReportsPage />);

    expect(await screen.findByText('Expiry Alerts, Reports & CSV Export')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /License Expiry/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Warranty Expiry/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reports & Export/i })).toBeInTheDocument();
  });

  it('2. License Expiry tab displays summary cards and classified licenses', async () => {
    renderWithAuth(<ReportsPage />);

    expect(await screen.findByText('JetBrains All Products Pack')).toBeInTheDocument();
    expect(screen.getByText('Microsoft 365 E5 Enterprise')).toBeInTheDocument();
    expect(screen.getByText('LIC-JB-ALL-2026')).toBeInTheDocument();

    // Check expiry bucket badges
    expect(screen.getAllByText('Expired').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('≤ 7 Days').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('≤ 30 Days').length).toBeGreaterThanOrEqual(1);
  });

  it('3. Filtering by search term filters the license table dynamically', async () => {
    renderWithAuth(<ReportsPage />);

    expect(await screen.findByText('JetBrains All Products Pack')).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText(/Search licenses by name, vendor, or code/i);
    fireEvent.change(searchInput, { target: { value: 'Microsoft' } });

    expect(await screen.findByText('Microsoft 365 E5 Enterprise')).toBeInTheDocument();
    expect(screen.queryByText('JetBrains All Products Pack')).not.toBeInTheDocument();
  });

  it('4. Switching to Hardware Warranty tab renders warranty assets', async () => {
    renderWithAuth(<ReportsPage />);

    expect(await screen.findByText('JetBrains All Products Pack')).toBeInTheDocument();

    const warrantyTab = screen.getByRole('button', { name: /Warranty Expiry/i });
    fireEvent.click(warrantyTab);

    expect(await screen.findByText('Dell XPS 15 9530')).toBeInTheDocument();
    expect(screen.getByText('AST-HW-1001')).toBeInTheDocument();
    expect(screen.getByText('Apple MacBook Pro 16" M3')).toBeInTheDocument();
  });

  it('5. Reports & Export tab displays report cards and preview button', async () => {
    renderWithAuth(<ReportsPage />);

    const reportsTab = screen.getByRole('button', { name: /Reports & Export/i });
    fireEvent.click(reportsTab);

    expect(await screen.findByText('Asset Inventory')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Preview/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /Download CSV/i }).length).toBeGreaterThanOrEqual(1);
  });

  it('6. Preview button loads and displays tabular audit data', async () => {
    renderWithAuth(<ReportsPage />);

    const reportsTab = screen.getByRole('button', { name: /Reports & Export/i });
    fireEvent.click(reportsTab);

    const previewButtons = await screen.findAllByRole('button', { name: /Preview/i });
    fireEvent.click(previewButtons[0]);

    expect(await screen.findByText('AST-HW-1001')).toBeInTheDocument();
    expect(screen.getByText('Dell XPS 15 9530')).toBeInTheDocument();
    expect(screen.getByText('AST-HW-1002')).toBeInTheDocument();
  });

  it('7. Download CSV triggers download via reportApi client', async () => {
    renderWithAuth(<ReportsPage />);

    const reportsTab = screen.getByRole('button', { name: /Reports & Export/i });
    fireEvent.click(reportsTab);

    const downloadButtons = await screen.findAllByRole('button', { name: /Download CSV/i });
    fireEvent.click(downloadButtons[0]);

    expect(reportApi.downloadCsv).toHaveBeenCalledWith('asset_inventory');
  });

  it('8. Handles API error gracefully with alert and retry button', async () => {
    vi.spyOn(expiryApi, 'getLicenseExpiry').mockRejectedValueOnce(new Error('Network error on expiry'));

    renderWithAuth(<ReportsPage />);

    expect(await screen.findByText('Network error on expiry')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
  });

  it('9. Dashboard incorporates real expiry summary data', async () => {
    vi.spyOn(healthApi, 'getHealth').mockResolvedValue({
      healthy: true,
      status: 'UP',
      database: { status: 'CONNECTED', engine: 'SQLite 3', tablesFound: 8 }
    });
    vi.spyOn(assetApi, 'list').mockResolvedValue({
      assets: [{ id: 1, status: 'AVAILABLE' }],
      pagination: { total: 1 }
    });
    vi.spyOn(employeeApi, 'list').mockResolvedValue({
      employees: [{ id: 1 }],
      pagination: { total: 1 }
    });
    vi.spyOn(licenseApi, 'list').mockResolvedValue({
      licenses: [{ id: 1, total_quantity: 10, used_quantity: 5 }],
      pagination: { total: 1 }
    });
    vi.spyOn(expiryApi, 'getDashboardSummary').mockResolvedValue({
      licenses: { near_expiry_total: 4, expired: 2, expiring_30_days: 2 },
      warranty: { near_expiry_total: 1 }
    });

    renderWithAuth(<DashboardPage />);

    expect(await screen.findByText('Licenses Near Expiry')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('Live Module 6 API')).toBeInTheDocument();
  });
});
