import React from 'react';
import { LicenseExpiryTab } from './ReportsPage';

export function LicenseExpiryPage() {
  return (
    <div>
      {/* Page Header */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-slate-900)' }}>
          License Expiry Alerts
        </h2>
      </div>

      <LicenseExpiryTab />
    </div>
  );
}

export default LicenseExpiryPage;
