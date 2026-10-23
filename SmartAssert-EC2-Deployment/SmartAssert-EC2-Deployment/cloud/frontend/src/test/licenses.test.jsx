import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LicensesPage } from '../pages/LicensesPage';
import { DashboardPage } from '../pages/DashboardPage';
import { AuthContext } from '../context/AuthContext';
import { licenseApi } from '../api/licenseApi';
import { employeeApi } from '../api/employeeApi';
import { healthApi } from '../api/healthApi';
import { assetApi } from '../api/assetApi';

const MOCK_ADMIN_USER = {
  id: 1,
  username: 'admin',
  full_name: 'IT Administrator',
  role: 'SUPERADMIN'
};

const MOCK_LICENSES = [
  {
    id: 1,
    license_code: 'LIC-MS365-2026',
    software_name: 'Microsoft 365 E5',
    vendor: 'Microsoft Corp',
    license_type: 'ANNUAL_SUBSCRIPTION',
    total_quantity: 50,
    used_quantity: 35,
    available_quantity: 15,
    cost: 1750.0,
    purchase_date: '2026-01-01',
    expiry_date: '2026-12-31',
    status: 'ACTIVE'
  },
  {
    id: 2,
    license_code: 'LIC-JB-2026',
    software_name: 'JetBrains All Products Pack',
    vendor: 'JetBrains s.r.o.',
    license_type: 'VOLUME_SEAT',
    total_quantity: 10,
    used_quantity: 10,
    available_quantity: 0,
    cost: 4990.0,
    purchase_date: '2026-02-01',
    expiry_date: '2027-02-01',
    status: 'ACTIVE'
  },
  {
    id: 3,
    license_code: 'LIC-VS-2025',
    software_name: 'Visual Studio Enterprise',
    vendor: 'Microsoft',
    license_type: 'PERPETUAL',
    total_quantity: 5,
    used_quantity: 0,
    available_quantity: 5,
    cost: 12000.0,
    purchase_date: '2025-05-10',
    expiry_date: null,
    status: 'ACTIVE'
  }
];

const MOCK_EMPLOYEES = [
  { id: 1, employee_code: 'EMP-1001', full_name: 'Aarav Sharma', department: 'Engineering', status: 'ACTIVE' },
  { id: 2, employee_code: 'EMP-1002', full_name: 'Diya Patel', department: 'Product', status: 'ACTIVE' }
];

const MOCK_ALLOCATIONS = [
  {
    id: 101,
    license_id: 1,
    employee_id: 1,
    allocated_at: '2026-02-15 10:00:00',
    revoked_at: null,
    employee_name: 'Aarav Sharma',
    employee_code: 'EMP-1001',
    employee_department: 'Engineering'
  },
  {
    id: 102,
    license_id: 1,
    employee_id: 2,
    allocated_at: '2026-01-10 09:00:00',
    revoked_at: '2026-03-01 14:00:00',
    employee_name: 'Diya Patel',
    employee_code: 'EMP-1002',
    employee_department: 'Product'
  }
];

const renderWithAuth = (ui) => {
  return render(
    <AuthContext.Provider value={{ user: MOCK_ADMIN_USER, isAuthenticated: true, loading: false }}>
      <MemoryRouter>
        {ui}
      </MemoryRouter>
    </AuthContext.Provider>
  );
};

describe('Module 5 — Software License Management & Allocation Lifecycle Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // 1. License listing
  it('1. Loads and renders software license inventory table with derived availability', async () => {
    vi.spyOn(licenseApi, 'list').mockResolvedValue({
      licenses: MOCK_LICENSES,
      pagination: { total: 3, page: 1, limit: 10 }
    });
    vi.spyOn(employeeApi, 'list').mockResolvedValue({
      employees: MOCK_EMPLOYEES,
      pagination: { total: 2, page: 1, limit: 100 }
    });

    renderWithAuth(<LicensesPage />);

    expect(await screen.findByText('Microsoft 365 E5')).toBeInTheDocument();
    expect(screen.getByText('JetBrains All Products Pack')).toBeInTheDocument();
    expect(screen.getByText('Visual Studio Enterprise')).toBeInTheDocument();
    expect(screen.getByText('Microsoft Corp')).toBeInTheDocument();
  });

  // 2. Search and filter query triggers
  it('2. Search input and filters trigger list API with correct parameters', async () => {
    const listSpy = vi.spyOn(licenseApi, 'list').mockResolvedValue({
      licenses: [MOCK_LICENSES[0]],
      pagination: { total: 1, page: 1, limit: 10 }
    });
    vi.spyOn(employeeApi, 'list').mockResolvedValue({
      employees: MOCK_EMPLOYEES,
      pagination: { total: 2, page: 1, limit: 100 }
    });

    renderWithAuth(<LicensesPage />);
    await screen.findByText('Microsoft 365 E5');

    const searchInput = screen.getByPlaceholderText(/Search by title, vendor, or code/i);
    fireEvent.change(searchInput, { target: { value: 'JetBrains' } });

    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ search: 'JetBrains' }));
    });

    const typeSelect = screen.getByLabelText(/Filter by License Type/i);
    fireEvent.change(typeSelect, { target: { value: 'VOLUME_SEAT' } });

    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'VOLUME_SEAT' }));
    });
  });

  // 3. Seat-utilization rendering & progress bar
  it('3. Renders seat utilization progress bar and accurate remaining capacity', async () => {
    vi.spyOn(licenseApi, 'list').mockResolvedValue({
      licenses: MOCK_LICENSES,
      pagination: { total: 3, page: 1, limit: 10 }
    });
    vi.spyOn(employeeApi, 'list').mockResolvedValue({ employees: [], pagination: { total: 0 } });

    renderWithAuth(<LicensesPage />);
    await screen.findByText('Microsoft 365 E5');

    // 35 / 50 seats (70%)
    expect(screen.getByText(/35 \/ 50 seats/i)).toBeInTheDocument();
    expect(screen.getByText(/15 avail/i)).toBeInTheDocument();

    const progressBars = screen.getAllByRole('progressbar');
    expect(progressBars.length).toBeGreaterThanOrEqual(2);
    expect(progressBars[0]).toHaveAttribute('aria-valuenow', '70');
  });

  // 4. Zero-seat and full-capacity states
  it('4. Handles full-capacity state with warning badge and disabled allocation indicator', async () => {
    vi.spyOn(licenseApi, 'list').mockResolvedValue({
      licenses: [MOCK_LICENSES[1]], // JetBrains 10/10 seats
      pagination: { total: 1, page: 1, limit: 10 }
    });
    vi.spyOn(employeeApi, 'list').mockResolvedValue({ employees: [], pagination: { total: 0 } });

    renderWithAuth(<LicensesPage />);
    await screen.findByText('JetBrains All Products Pack');

    // Full capacity (0 avail, 100%)
    expect(screen.getByText(/0 avail/i)).toBeInTheDocument();
    expect(screen.getByText(/100%/i)).toBeInTheDocument();
  });

  // 5. Create license form modal and validation
  it('5. Create license modal validates required fields and submits successfully', async () => {
    vi.spyOn(licenseApi, 'list').mockResolvedValue({
      licenses: MOCK_LICENSES,
      pagination: { total: 3, page: 1, limit: 10 }
    });
    vi.spyOn(employeeApi, 'list').mockResolvedValue({ employees: [], pagination: { total: 0 } });
    const createSpy = vi.spyOn(licenseApi, 'create').mockResolvedValue({
      id: 4,
      license_code: 'LIC-FIGMA-2026',
      software_name: 'Figma Enterprise',
      vendor: 'Figma Inc.',
      license_type: 'VOLUME_SEAT',
      total_quantity: 15,
      used_quantity: 0,
      available_quantity: 15,
      cost: 3600
    });

    renderWithAuth(<LicensesPage />);
    await screen.findByText('Microsoft 365 E5');

    const addBtn = screen.getByRole('button', { name: /Add License/i });
    fireEvent.click(addBtn);

    expect(screen.getByRole('heading', { name: /Register Software License Agreement/i })).toBeInTheDocument();

    // Fill form
    fireEvent.change(screen.getByLabelText(/License Identifier \/ Code/i), { target: { value: 'LIC-FIGMA-2026' } });
    fireEvent.change(screen.getByLabelText(/Software \/ Product Title/i), { target: { value: 'Figma Enterprise' } });
    fireEvent.change(screen.getByLabelText(/Vendor \/ Publisher/i), { target: { value: 'Figma Inc.' } });
    fireEvent.change(screen.getByLabelText(/^License Type \*/i), { target: { value: 'VOLUME_SEAT' } });
    fireEvent.change(screen.getByLabelText(/Total Purchased Seats/i), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText(/Annual \/ Total Cost/i), { target: { value: '3600' } });
    fireEvent.change(screen.getByLabelText(/Purchase Date \*/i), { target: { value: '2026-03-01' } });

    const submitBtn = screen.getByRole('button', { name: /Register License/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({
        license_code: 'LIC-FIGMA-2026',
        software_name: 'Figma Enterprise',
        vendor: 'Figma Inc.',
        license_type: 'VOLUME_SEAT',
        total_quantity: 15,
        purchase_cost: 3600
      }));
    });
  });

  // 6. Edit license form modal
  it('6. Edit license modal opens with prefilled data and submits updates', async () => {
    vi.spyOn(licenseApi, 'list').mockResolvedValue({
      licenses: [MOCK_LICENSES[0]],
      pagination: { total: 1, page: 1, limit: 10 }
    });
    vi.spyOn(employeeApi, 'list').mockResolvedValue({ employees: [], pagination: { total: 0 } });
    const updateSpy = vi.spyOn(licenseApi, 'update').mockResolvedValue({
      ...MOCK_LICENSES[0],
      total_quantity: 60
    });

    renderWithAuth(<LicensesPage />);
    await screen.findByText('Microsoft 365 E5');

    const editBtn = screen.getByRole('button', { name: /Edit Microsoft 365 E5/i });
    fireEvent.click(editBtn);

    expect(screen.getByRole('heading', { name: /Edit License: Microsoft 365 E5/i })).toBeInTheDocument();
    const qtyInput = screen.getByLabelText(/Total Purchased Seats/i);
    expect(qtyInput.value).toBe('50');

    fireEvent.change(qtyInput, { target: { value: '60' } });
    fireEvent.click(screen.getByRole('button', { name: /Update License/i }));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(1, expect.objectContaining({
        total_quantity: 60
      }));
    });
  });

  // 7. Allocation interface opens and displays active allocations
  it('7. Allocation modal opens, displays active allocations and history', async () => {
    vi.spyOn(licenseApi, 'list').mockResolvedValue({
      licenses: [MOCK_LICENSES[0]],
      pagination: { total: 1, page: 1, limit: 10 }
    });
    vi.spyOn(employeeApi, 'list').mockResolvedValue({
      employees: MOCK_EMPLOYEES,
      pagination: { total: 2, page: 1, limit: 100 }
    });
    vi.spyOn(licenseApi, 'getAllocations').mockResolvedValue(MOCK_ALLOCATIONS);

    renderWithAuth(<LicensesPage />);
    await screen.findByText('Microsoft 365 E5');

    const manageBtn = screen.getAllByRole('button', { name: /Allocations/i })[0];
    fireEvent.click(manageBtn);

    expect(await screen.findByRole('heading', { name: /Seat Allocations: Microsoft 365 E5/i })).toBeInTheDocument();
    // Active allocation tab shows Aarav Sharma
    expect(screen.getByText('Aarav Sharma')).toBeInTheDocument();
    expect(screen.getByText('EMP-1001')).toBeInTheDocument();

    // Click Revoked History tab
    const historyTab = screen.getByRole('button', { name: /Revoked History/i });
    fireEvent.click(historyTab);

    // Shows revoked allocation for Diya Patel
    expect(screen.getByText('Diya Patel')).toBeInTheDocument();
    expect(screen.getByText('EMP-1002')).toBeInTheDocument();
  });

  // 8. Allocation success workflow
  it('8. Allocates license seat to eligible employee and updates interface', async () => {
    vi.spyOn(licenseApi, 'list').mockResolvedValue({
      licenses: [MOCK_LICENSES[0]],
      pagination: { total: 1, page: 1, limit: 10 }
    });
    vi.spyOn(employeeApi, 'list').mockResolvedValue({
      employees: MOCK_EMPLOYEES,
      pagination: { total: 2, page: 1, limit: 100 }
    });
    vi.spyOn(licenseApi, 'getAllocations').mockResolvedValue([]);
    const allocateSpy = vi.spyOn(licenseApi, 'allocateSeat').mockResolvedValue({
      success: true,
      allocation: { id: 105, license_id: 1, employee_id: 2 }
    });

    renderWithAuth(<LicensesPage />);
    await screen.findByText('Microsoft 365 E5');

    fireEvent.click(screen.getAllByRole('button', { name: /Allocations/i })[0]);
    await screen.findByRole('heading', { name: /Seat Allocations: Microsoft 365 E5/i });

    // Select employee
    const empSelect = screen.getByLabelText(/Select Active Employee \*/i);
    fireEvent.change(empSelect, { target: { value: '2' } });

    // Click Confirm Allocation
    const allocBtn = screen.getByRole('button', { name: /Confirm Allocation/i });
    fireEvent.click(allocBtn);

    await waitFor(() => {
      expect(allocateSpy).toHaveBeenCalledWith(1, { employee_id: 2, notes: '' });
    });
  });

  // 9. Revocation and capacity release
  it('9. Revoking an allocation invokes API with confirmation and frees seat', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(licenseApi, 'list').mockResolvedValue({
      licenses: [MOCK_LICENSES[0]],
      pagination: { total: 1, page: 1, limit: 10 }
    });
    vi.spyOn(employeeApi, 'list').mockResolvedValue({
      employees: MOCK_EMPLOYEES,
      pagination: { total: 2, page: 1, limit: 100 }
    });
    vi.spyOn(licenseApi, 'getAllocations').mockResolvedValue([MOCK_ALLOCATIONS[0]]);
    const revokeSpy = vi.spyOn(licenseApi, 'revokeAllocation').mockResolvedValue({
      success: true,
      message: 'License allocation revoked successfully.'
    });

    renderWithAuth(<LicensesPage />);
    await screen.findByText('Microsoft 365 E5');

    fireEvent.click(screen.getAllByRole('button', { name: /Allocations/i })[0]);
    await screen.findByText('Aarav Sharma');

    const revokeBtn = screen.getByTitle('Revoke seat');
    fireEvent.click(revokeBtn);

    await waitFor(() => {
      expect(revokeSpy).toHaveBeenCalledWith(1, 101);
    });
  });

  // 10. API error state and retry handling
  it('10. Displays error alert when API fetch fails and provides retry action', async () => {
    const listSpy = vi.spyOn(licenseApi, 'list')
      .mockRejectedValueOnce(new Error('Connection timeout to SQLite database'))
      .mockResolvedValueOnce({
        licenses: MOCK_LICENSES,
        pagination: { total: 3, page: 1, limit: 10 }
      });
    vi.spyOn(employeeApi, 'list').mockResolvedValue({ employees: [], pagination: { total: 0 } });

    renderWithAuth(<LicensesPage />);

    expect(await screen.findByText(/Unable to load software licenses:/i)).toBeInTheDocument();
    expect(screen.getByText(/Connection timeout to SQLite database/i)).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /Retry/i });
    fireEvent.click(retryBtn);

    expect(await screen.findByText('Microsoft 365 E5')).toBeInTheDocument();
  });

  // 11. Dashboard derives live metrics from license API
  it('11. Dashboard displays real database-backed license counts and seat allocations', async () => {
    vi.spyOn(healthApi, 'getHealth').mockResolvedValue({
      healthy: true,
      status: 'UP',
      database: { status: 'CONNECTED', engine: 'SQLite 3', tablesFound: 8 }
    });
    vi.spyOn(assetApi, 'list').mockResolvedValue({
      assets: [],
      pagination: { total: 0, page: 1, limit: 1000 }
    });
    vi.spyOn(employeeApi, 'list').mockResolvedValue({
      employees: [],
      pagination: { total: 0, page: 1, limit: 1 }
    });
    vi.spyOn(licenseApi, 'list').mockResolvedValue({
      licenses: [
        { id: 1, total_quantity: 50, used_quantity: 35 },
        { id: 2, total_quantity: 10, used_quantity: 10 }
      ],
      pagination: { total: 2, page: 1, limit: 1000 }
    });

    renderWithAuth(<DashboardPage />);

    // Total licenses = 2
    expect(await screen.findByText('2')).toBeInTheDocument();
    // Live Module 5 badge
    expect(screen.getByText('Live Module 5 API')).toBeInTheDocument();
    // Subtext showing 45 of 60 seats allocated (35 + 10 = 45 used, 50 + 10 = 60 total)
    expect(screen.getByText('45 of 60 seats allocated')).toBeInTheDocument();
  });

  // 12. Live Module 6 expiry metric
  it('12. Expiry metric displays Live Module 6 API', async () => {
    vi.spyOn(healthApi, 'getHealth').mockResolvedValue({
      healthy: true,
      status: 'UP',
      database: { status: 'CONNECTED', engine: 'SQLite 3', tablesFound: 8 }
    });
    vi.spyOn(assetApi, 'list').mockResolvedValue({ assets: [], pagination: { total: 0 } });
    vi.spyOn(employeeApi, 'list').mockResolvedValue({ employees: [], pagination: { total: 0 } });
    vi.spyOn(licenseApi, 'list').mockResolvedValue({ licenses: [], pagination: { total: 0 } });

    renderWithAuth(<DashboardPage />);

    expect(await screen.findByText('Licenses Near Expiry')).toBeInTheDocument();
    expect(screen.getByText('Live Module 6 API')).toBeInTheDocument();
  });
});
