import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AssetsPage } from '../pages/AssetsPage';
import { EmployeesPage } from '../pages/EmployeesPage';
import { DashboardPage } from '../pages/DashboardPage';
import { AuthContext } from '../context/AuthContext';
import { assetApi } from '../api/assetApi';
import { employeeApi } from '../api/employeeApi';
import { healthApi } from '../api/healthApi';
import { licenseApi } from '../api/licenseApi';

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

describe('Module 4 — Assets, Employees, Lifecycle & Dashboard Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Asset list loading and rendering
  // -------------------------------------------------------------------------
  it('1. Asset list loads and renders records in the table', async () => {
    vi.spyOn(assetApi, 'list').mockResolvedValue({
      assets: [
        {
          id: 1,
          asset_tag: 'AST-2026-0001',
          name: 'ThinkPad T14s',
          category: 'LAPTOP',
          status: 'AVAILABLE',
          manufacturer: 'Lenovo',
          model: 'Gen 4',
          serial_number: 'SN-THINKPAD-01',
          current_employee_id: null
        },
        {
          id: 2,
          asset_tag: 'AST-2026-0002',
          name: 'MacBook Pro 16',
          category: 'LAPTOP',
          status: 'ASSIGNED',
          manufacturer: 'Apple',
          model: 'M3 Max',
          serial_number: 'SN-MBP-02',
          current_employee_id: 1,
          current_employee_name: 'Sarah Connor',
          current_employee_code: 'EMP-2026-0001',
          current_employee_dept: 'Engineering'
        }
      ],
      pagination: { total: 2, page: 1, limit: 10 }
    });

    renderWithAuth(<AssetsPage />);

    expect(screen.getByText(/Loading assets from database.../i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('AST-2026-0001')).toBeInTheDocument();
      expect(screen.getByText('ThinkPad T14s')).toBeInTheDocument();
      expect(screen.getByText('AST-2026-0002')).toBeInTheDocument();
      expect(screen.getByText('Sarah Connor')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // 2. Asset creation and validation
  // -------------------------------------------------------------------------
  it('2. Asset creation modal validates input and submits new asset', async () => {
    vi.spyOn(assetApi, 'list').mockResolvedValue({
      assets: [],
      pagination: { total: 0, page: 1, limit: 10 }
    });
    const createSpy = vi.spyOn(assetApi, 'create').mockResolvedValue({
      id: 3,
      asset_tag: 'AST-2026-0003',
      name: 'Dell Precision 7780'
    });

    renderWithAuth(<AssetsPage />);

    await waitFor(() => {
      expect(screen.getByText('Add Asset')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add Asset'));

    expect(screen.getByText('Register New Hardware Asset')).toBeInTheDocument();

    // Fill form
    fireEvent.change(screen.getByPlaceholderText(/e.g. AST-2026-0010/i), {
      target: { value: 'AST-2026-0003' }
    });
    fireEvent.change(screen.getByPlaceholderText(/e.g. ThinkPad X1/i), {
      target: { value: 'Dell Precision 7780' }
    });

    fireEvent.click(screen.getByText('Create Asset'));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          asset_tag: 'AST-2026-0003',
          name: 'Dell Precision 7780'
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // 3. Asset editing
  // -------------------------------------------------------------------------
  it('3. Asset edit modal opens with prefilled data and submits updates', async () => {
    vi.spyOn(assetApi, 'list').mockResolvedValue({
      assets: [
        {
          id: 1,
          asset_tag: 'AST-2026-0001',
          name: 'ThinkPad T14s',
          category: 'LAPTOP',
          status: 'AVAILABLE',
          manufacturer: 'Lenovo',
          current_employee_id: null
        }
      ],
      pagination: { total: 1, page: 1, limit: 10 }
    });
    const updateSpy = vi.spyOn(assetApi, 'update').mockResolvedValue({
      id: 1,
      name: 'ThinkPad T14s Gen 5'
    });

    renderWithAuth(<AssetsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText('Edit AST-2026-0001')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Edit AST-2026-0001'));

    expect(screen.getByText('Edit Asset: AST-2026-0001')).toBeInTheDocument();

    const nameInput = screen.getByPlaceholderText(/e.g. ThinkPad X1/i);
    expect(nameInput.value).toBe('ThinkPad T14s');

    fireEvent.change(nameInput, { target: { value: 'ThinkPad T14s Gen 5' } });
    fireEvent.click(screen.getByText('Update Asset'));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          name: 'ThinkPad T14s Gen 5'
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // 4. Search and category filter interaction
  // -------------------------------------------------------------------------
  it('4. Search input and category filter trigger list queries with updated params', async () => {
    const listSpy = vi.spyOn(assetApi, 'list').mockResolvedValue({
      assets: [],
      pagination: { total: 0, page: 1, limit: 10 }
    });

    renderWithAuth(<AssetsPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search by tag/i)).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search by tag/i);
    fireEvent.change(searchInput, { target: { value: 'MacBook' } });

    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'MacBook'
        })
      );
    });

    const categorySelect = screen.getByLabelText('Filter by Category');
    fireEvent.change(categorySelect, { target: { value: 'SERVER' } });

    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'SERVER'
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // 5. Assignment workflow modal and submission
  // -------------------------------------------------------------------------
  it('5. Assignment modal renders employee options and submits assignment', async () => {
    vi.spyOn(assetApi, 'list').mockResolvedValue({
      assets: [
        {
          id: 1,
          asset_tag: 'AST-2026-0001',
          name: 'ThinkPad T14s',
          category: 'LAPTOP',
          status: 'AVAILABLE',
          current_employee_id: null
        }
      ],
      pagination: { total: 1, page: 1, limit: 10 }
    });
    vi.spyOn(employeeApi, 'list').mockResolvedValue({
      employees: [
        { id: 10, employee_code: 'EMP-010', full_name: 'Elena Rostova', department: 'DevOps', status: 'ACTIVE' }
      ]
    });
    const assignSpy = vi.spyOn(assetApi, 'assign').mockResolvedValue({
      success: true,
      message: 'Asset assigned successfully'
    });

    renderWithAuth(<AssetsPage />);

    await waitFor(() => {
      expect(screen.getByText('Assign')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Assign'));

    await waitFor(() => {
      expect(screen.getByText('Assign Asset to Employee')).toBeInTheDocument();
      expect(screen.getByText(/Elena Rostova/i)).toBeInTheDocument();
    });

    const select = screen.getByLabelText(/Select Active Employee/i);
    fireEvent.change(select, { target: { value: '10' } });

    fireEvent.click(screen.getByText('Confirm Assignment'));

    await waitFor(() => {
      expect(assignSpy).toHaveBeenCalledWith(1, 10, '');
    });
  });

  // -------------------------------------------------------------------------
  // 6. Return workflow modal and submission
  // -------------------------------------------------------------------------
  it('6. Return modal triggers return lifecycle workflow', async () => {
    vi.spyOn(assetApi, 'list').mockResolvedValue({
      assets: [
        {
          id: 2,
          asset_tag: 'AST-2026-0002',
          name: 'MacBook Pro 16',
          category: 'LAPTOP',
          status: 'ASSIGNED',
          current_employee_id: 10,
          current_employee_name: 'Elena Rostova'
        }
      ],
      pagination: { total: 1, page: 1, limit: 10 }
    });
    const returnSpy = vi.spyOn(assetApi, 'returnAsset').mockResolvedValue({
      success: true,
      message: 'Asset returned successfully'
    });

    renderWithAuth(<AssetsPage />);

    await waitFor(() => {
      expect(screen.getByText('Return')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Return'));

    expect(screen.getByText('Return Asset to Inventory')).toBeInTheDocument();
    expect(screen.getByText(/Currently held by:/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Confirm Return'));

    await waitFor(() => {
      expect(returnSpy).toHaveBeenCalledWith(2, '');
    });
  });

  // -------------------------------------------------------------------------
  // 7. Assignment history view
  // -------------------------------------------------------------------------
  it('7. Assignment history modal displays chronological custody records', async () => {
    vi.spyOn(assetApi, 'list').mockResolvedValue({
      assets: [
        {
          id: 1,
          asset_tag: 'AST-2026-0001',
          name: 'ThinkPad T14s',
          category: 'LAPTOP',
          status: 'AVAILABLE'
        }
      ],
      pagination: { total: 1, page: 1, limit: 10 }
    });
    vi.spyOn(assetApi, 'getHistory').mockResolvedValue([
      {
        id: 101,
        employee_name: 'Sarah Connor',
        employee_code: 'EMP-001',
        department: 'Engineering',
        assigned_at: '2026-01-10T10:00:00.000Z',
        returned_at: '2026-02-15T15:00:00.000Z',
        notes: 'Initial laptop kit'
      }
    ]);

    renderWithAuth(<AssetsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText('View history for AST-2026-0001')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('View history for AST-2026-0001'));

    await waitFor(() => {
      expect(screen.getByText('Custody Assignment History')).toBeInTheDocument();
      expect(screen.getByText(/Sarah Connor \(EMP-001\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Initial laptop kit/i)).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // 8. Employee listing and creation
  // -------------------------------------------------------------------------
  it('8. Employee directory renders personnel and creates new employee', async () => {
    vi.spyOn(employeeApi, 'list').mockResolvedValue({
      employees: [
        {
          id: 1,
          employee_code: 'EMP-2026-0001',
          full_name: 'Sarah Connor',
          email: 'sconnor@assetflow.local',
          department: 'Engineering',
          job_title: 'Lead DevOps',
          status: 'ACTIVE'
        }
      ],
      pagination: { total: 1, page: 1, limit: 10 }
    });
    const createEmpSpy = vi.spyOn(employeeApi, 'create').mockResolvedValue({
      id: 2,
      employee_code: 'EMP-2026-0002',
      full_name: 'John Connor',
      email: 'jconnor@assetflow.local',
      department: 'Engineering',
      status: 'ACTIVE'
    });

    renderWithAuth(<EmployeesPage />);

    await waitFor(() => {
      expect(screen.getByText('EMP-2026-0001')).toBeInTheDocument();
      expect(screen.getByText('Sarah Connor')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add Employee'));

    expect(screen.getByText('Create Employee Profile')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/e.g. EMP-2026-0008/i), {
      target: { value: 'EMP-2026-0002' }
    });
    fireEvent.change(screen.getByPlaceholderText(/e.g. Sarah Connor/i), {
      target: { value: 'John Connor' }
    });
    fireEvent.change(screen.getByPlaceholderText(/e.g. sconnor@assetflow.local/i), {
      target: { value: 'jconnor@assetflow.local' }
    });

    fireEvent.click(screen.getByText('Create Profile'));

    await waitFor(() => {
      expect(createEmpSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          employee_code: 'EMP-2026-0002',
          full_name: 'John Connor',
          email: 'jconnor@assetflow.local'
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // 9. API error and retry states
  // -------------------------------------------------------------------------
  it('9. Error banner renders when API call fails and provides retry button', async () => {
    const listSpy = vi.spyOn(assetApi, 'list')
      .mockRejectedValueOnce(new Error('Database network timeout'))
      .mockResolvedValueOnce({
        assets: [
          { id: 1, asset_tag: 'AST-RETRY-01', name: 'Recovery Asset', status: 'AVAILABLE' }
        ],
        pagination: { total: 1, page: 1, limit: 10 }
      });

    renderWithAuth(<AssetsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Unable to load assets:/i)).toBeInTheDocument();
      expect(screen.getByText(/Database network timeout/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('AST-RETRY-01')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // 10. Dashboard metrics use actual API results and license metrics stay honest
  // -------------------------------------------------------------------------
  it('10. Dashboard displays live asset & employee counts and preserves pending badges', async () => {
    vi.spyOn(healthApi, 'getHealth').mockResolvedValue({
      healthy: true,
      status: 'UP',
      database: { status: 'CONNECTED', engine: 'SQLite 3', tablesFound: 8 }
    });
    vi.spyOn(assetApi, 'list').mockResolvedValue({
      assets: [
        { id: 1, status: 'AVAILABLE' },
        { id: 2, status: 'AVAILABLE' },
        { id: 3, status: 'ASSIGNED' }
      ],
      pagination: { total: 3, page: 1, limit: 1000 }
    });
    vi.spyOn(employeeApi, 'list').mockResolvedValue({
      employees: [],
      pagination: { total: 5, page: 1, limit: 1 }
    });
    vi.spyOn(licenseApi, 'list').mockResolvedValue({
      licenses: [
        { id: 1, software_name: 'Microsoft 365', total_quantity: 25, used_quantity: 8 }
      ],
      pagination: { total: 4, page: 1, limit: 1000 }
    });

    renderWithAuth(<DashboardPage />);

    await waitFor(() => {
      // Total assets = 3
      expect(screen.getByText('3')).toBeInTheDocument();
      // Assigned assets = 1
      expect(screen.getByText('1')).toBeInTheDocument();
      // Available assets = 2
      expect(screen.getByText('2')).toBeInTheDocument();
      // Total employees = 5
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    // Check that Software Licenses reflects Live Module 5 and Licenses Near Expiry reflects Live Module 6
    expect(screen.getByText('Live Module 5 API')).toBeInTheDocument();
    expect(screen.getByText('Live Module 6 API')).toBeInTheDocument();
  });
});
