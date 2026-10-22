import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div className="login-page-container">
      <div className="login-card" style={{ textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', backgroundColor: 'var(--color-danger-bg)', color: 'var(--color-danger-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <AlertCircle size={28} />
        </div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-slate-900)', marginBottom: '8px' }}>
          404 — Page Not Found
        </h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--color-slate-500)', marginBottom: '24px' }}>
          The requested administrative page or route does not exist.
        </p>
        <Link to="/dashboard" className="btn btn-primary" style={{ display: 'inline-flex', width: 'auto' }}>
          <ArrowLeft size={16} />
          <span>Return to Dashboard</span>
        </Link>
      </div>
    </div>
  );
}
