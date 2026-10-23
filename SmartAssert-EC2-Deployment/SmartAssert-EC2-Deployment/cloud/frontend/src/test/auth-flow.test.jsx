import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { AppRoutes } from '../routes/AppRoutes';
import { apiClient } from '../api/client';

const MOCK_ADMIN = {
  id: 1,
  username: 'admin',
  email: 'admin@enterprise.local',
  full_name: 'IT Administrator',
  role: 'SUPERADMIN'
};

const MOCK_HEALTH = {
  status: 'UP',
  healthy: true,
  timestamp: new Date().toISOString(),
  environment: 'development',
  uptimeSeconds: 120,
  database: {
    status: 'CONNECTED',
    engine: 'SQLite 3',
    tablesFound: 8
  }
};

describe('Frontend Authentication, Navigation & Dashboard Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Test 1: Login form renders
  // -------------------------------------------------------------------------
  it('1. Login form renders with inputs, labels, and submit button', async () => {
    // Mock getMe() to return 401 (unauthenticated initially)
    vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (url.includes('/api/auth/me')) {
        return {
          ok: false,
          status: 401,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: false, error: 'Authentication required' })
        };
      }
      return { ok: false, status: 404, headers: new Headers() };
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    );

    // Verify fields are rendered
    expect(await screen.findByLabelText(/Username or Email Address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Administrator Password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign In to Console/i })).toBeInTheDocument();
    expect(screen.getByText(/smartAssert/i)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Test 2: Empty login submission handled
  // -------------------------------------------------------------------------
  it('2. Empty login submission triggers client-side validation errors', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (url.includes('/api/auth/me')) {
        return {
          ok: false,
          status: 401,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: false, error: 'Authentication required' })
        };
      }
      return { ok: false, status: 404, headers: new Headers() };
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    );

    const submitBtn = await screen.findByRole('button', { name: /Sign In to Console/i });
    fireEvent.click(submitBtn);

    // Validation messages should appear
    expect(await screen.findByText(/Username or email is required/i)).toBeInTheDocument();
    expect(screen.getByText(/Password is required/i)).toBeInTheDocument();

    // Verify POST /api/auth/login was NOT called
    const loginCalls = fetchSpy.mock.calls.filter((c) => c[0].includes('/api/auth/login'));
    expect(loginCalls.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Test 3: Successful login navigates to dashboard
  // -------------------------------------------------------------------------
  it('3. Successful login navigates to the dashboard and displays user greeting', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (url, options) => {
      if (url.includes('/api/auth/me')) {
        return {
          ok: false,
          status: 401,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: false, error: 'Authentication required' })
        };
      }
      if (url.includes('/api/auth/login') && options?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: { administrator: MOCK_ADMIN }
          })
        };
      }
      if (url.includes('/api/health')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => MOCK_HEALTH
        };
      }
      return { ok: false, status: 404, headers: new Headers() };
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    );

    const userInput = await screen.findByLabelText(/Username or Email Address/i);
    const passInput = screen.getByLabelText(/Administrator Password/i);
    const submitBtn = screen.getByRole('button', { name: /Sign In to Console/i });

    fireEvent.change(userInput, { target: { value: 'admin' } });
    fireEvent.change(passInput, { target: { value: 'ValidPassword123!' } });
    fireEvent.click(submitBtn);

    // Verify dashboard greeted the administrator
    expect(await screen.findByText(/Welcome back, IT Administrator/i)).toBeInTheDocument();
    expect(screen.getByText(/System Metrics & Inventory Summary/i)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Test 4: Failed login displays error banner
  // -------------------------------------------------------------------------
  it('4. Failed login displays accessible error message', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (url, options) => {
      if (url.includes('/api/auth/me')) {
        return {
          ok: false,
          status: 401,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: false, error: 'Authentication required' })
        };
      }
      if (url.includes('/api/auth/login')) {
        return {
          ok: false,
          status: 401,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: false,
            error: 'Invalid username/email or password.'
          })
        };
      }
      return { ok: false, status: 404, headers: new Headers() };
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    );

    const userInput = await screen.findByLabelText(/Username or Email Address/i);
    const passInput = screen.getByLabelText(/Administrator Password/i);
    const submitBtn = screen.getByRole('button', { name: /Sign In to Console/i });

    fireEvent.change(userInput, { target: { value: 'admin' } });
    fireEvent.change(passInput, { target: { value: 'WrongPassword!' } });
    fireEvent.click(submitBtn);

    expect(await screen.findByText(/Invalid username\/email or password/i)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Test 5: Protected pages redirect unauthenticated users
  // -------------------------------------------------------------------------
  it('5. Protected routes redirect unauthenticated users to /login', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (url.includes('/api/auth/me')) {
        return {
          ok: false,
          status: 401,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: false, error: 'Authentication required' })
        };
      }
      return { ok: false, status: 404, headers: new Headers() };
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    );

    // Must be redirected to login
    expect(await screen.findByRole('button', { name: /Sign In to Console/i })).toBeInTheDocument();
    expect(screen.queryByText(/Welcome back/i)).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Test 6: Existing valid session restored using /api/auth/me
  // -------------------------------------------------------------------------
  it('6. Existing valid session is restored using /api/auth/me', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (url.includes('/api/auth/me')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: { administrator: MOCK_ADMIN }
          })
        };
      }
      if (url.includes('/api/health')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => MOCK_HEALTH
        };
      }
      return { ok: false, status: 404, headers: new Headers() };
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    );

    // Directly access dashboard without entering credentials
    expect(await screen.findByText(/Welcome back, IT Administrator/i)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Test 7: Logout invokes API and returns user to login
  // -------------------------------------------------------------------------
  it('7. Logout invokes /api/auth/logout and navigates back to /login', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url, options) => {
      if (url.includes('/api/auth/me')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: { administrator: MOCK_ADMIN }
          })
        };
      }
      if (url.includes('/api/auth/logout') && options?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true, message: 'Logged out successfully.' })
        };
      }
      if (url.includes('/api/health')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => MOCK_HEALTH
        };
      }
      return { ok: false, status: 404, headers: new Headers() };
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    );

    // Find and click Logout button
    const logoutBtn = await screen.findByRole('button', { name: /Sign out/i });
    fireEvent.click(logoutBtn);

    // User should be redirected to login screen
    expect(await screen.findByRole('button', { name: /Sign In to Console/i })).toBeInTheDocument();

    // Verify logout endpoint was called
    const logoutCalls = fetchSpy.mock.calls.filter((c) => c[0].includes('/api/auth/logout'));
    expect(logoutCalls.length).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Test 8: API client includes cookie credentials
  // -------------------------------------------------------------------------
  it('8. API client sends credentials: "include" for secure HttpOnly cookie transfer', async () => {
    let capturedOptions = null;
    vi.spyOn(global, 'fetch').mockImplementation(async (url, options) => {
      capturedOptions = options;
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true })
      };
    });

    await apiClient.get('/api/test-endpoint');
    expect(capturedOptions.credentials).toBe('include');

    await apiClient.post('/api/test-endpoint', { test: true });
    expect(capturedOptions.credentials).toBe('include');
  });

  // -------------------------------------------------------------------------
  // Test 9: Dashboard displays honest unavailable-data states
  // -------------------------------------------------------------------------
  it('9. Dashboard displays honest pending states instead of fabricated metrics', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (url.includes('/api/auth/me')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: { administrator: MOCK_ADMIN }
          })
        };
      }
      if (url.includes('/api/health')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => MOCK_HEALTH
        };
      }
      if (url.includes('/api/licenses') || url.includes('/api/assets') || url.includes('/api/employees')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            licenses: [],
            assets: [],
            employees: [],
            pagination: { total: 0 }
          })
        };
      }
      return { ok: false, status: 404, headers: new Headers() };
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    );

    // Verify Honest Placeholder values
    expect(await screen.findByText(/Total Hardware Assets/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Software Licenses/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Licenses Near Expiry/i)).toBeInTheDocument();

    // Verify live badges for Module 5 and Module 6
    expect(screen.getByText(/Live Module 5 API/i)).toBeInTheDocument();
    expect(screen.getByText(/Live Module 6 API/i)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Test 10: Navigation links resolve to intended pages
  // -------------------------------------------------------------------------
  it('10. Navigation links resolve to intended pages', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (url.includes('/api/auth/me')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: { administrator: MOCK_ADMIN }
          })
        };
      }
      if (url.includes('/api/health')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => MOCK_HEALTH
        };
      }
      if (url.includes('/api/assets') || url.includes('/api/licenses') || url.includes('/api/employees')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            assets: [],
            licenses: [],
            employees: [],
            pagination: { total: 0 }
          })
        };
      }
      return { ok: false, status: 404, headers: new Headers() };
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    );

    // Click Hardware Assets navigation
    const assetsLink = await screen.findByRole('link', { name: /Hardware Assets/i });
    fireEvent.click(assetsLink);
    expect(await screen.findByRole('heading', { name: /Hardware Asset Inventory/i })).toBeInTheDocument();
    expect(screen.getByText(/Add Asset/i)).toBeInTheDocument();

    // Click Software Licenses navigation
    const licensesLink = screen.getByRole('link', { name: /Software Licenses/i });
    fireEvent.click(licensesLink);
    expect(await screen.findByRole('heading', { name: /Software License Management/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add License/i })).toBeInTheDocument();

    // Click Settings navigation
    const settingsLink = screen.getByRole('link', { name: /Settings/i });
    fireEvent.click(settingsLink);
    expect(await screen.findByRole('heading', { name: /System Settings & Administrator Configuration/i })).toBeInTheDocument();
  });
});
