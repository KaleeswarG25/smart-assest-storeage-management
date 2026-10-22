import React from 'react';
import { WarrantyExpiryTab } from './ReportsPage';

export function WarrantyExpiryPage() {
  return (
    <div>
      {/* Page Header */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-slate-900)' }}>
          Hardware Warranty Expiry
        </h2>
      </div>

      <WarrantyExpiryTab />
    </div>
  );
}

export default WarrantyExpiryPage;
