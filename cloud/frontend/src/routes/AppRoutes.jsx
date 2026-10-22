import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { MainLayout } from '../layouts/MainLayout';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { AssetsPage } from '../pages/AssetsPage';
import { EmployeesPage } from '../pages/EmployeesPage';
import { LicensesPage } from '../pages/LicensesPage';
import { LicenseExpiryPage } from '../pages/LicenseExpiryPage';
import { WarrantyExpiryPage } from '../pages/WarrantyExpiryPage';
import { ReportsExportPage } from '../pages/ReportsExportPage';
import { ReportsPage } from '../pages/ReportsPage';
import { SettingsPage } from '../pages/SettingsPage';
import { NotFoundPage } from '../pages/NotFoundPage';

export function AppRoutes() {
  return (
    <Routes>
      {/* Public Route */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protected Routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<MainLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/assets" element={<AssetsPage />} />
          <Route path="/employees" element={<EmployeesPage />} />
          <Route path="/licenses" element={<LicensesPage />} />
          <Route path="/license-expiry" element={<LicenseExpiryPage />} />
          <Route path="/warranty-expiry" element={<WarrantyExpiryPage />} />
          <Route path="/reports" element={<ReportsExportPage />} />
          <Route path="/reports/all" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      {/* Fallback 404 Route */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
