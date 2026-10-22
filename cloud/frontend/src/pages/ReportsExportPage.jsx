import React from 'react';
import { ReportsExportTab } from './ReportsPage';

export function ReportsExportPage() {
  return (
    <div>
      {/* Page Header */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-slate-900)' }}>
          Reports & CSV Export
        </h2>
      </div>

      <ReportsExportTab />
    </div>
  );
}

export default ReportsExportPage;
