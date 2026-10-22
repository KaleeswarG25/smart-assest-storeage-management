import React, { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { ShieldCheck, Eye, EyeOff, AlertCircle, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function LoginPage() {
  const { login, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [errorMessage, setErrorMessage] = useState('');

  // If already authenticated and not loading, redirect immediately to dashboard or intended route
  if (!loading && isAuthenticated) {
    const destination = location.state?.from?.pathname || '/dashboard';
    return <Navigate to={destination} replace />;
  }

  const validate = () => {
    const errors = {};
    if (!identifier.trim()) {
      errors.identifier = 'Username or email is required.';
    }
    if (!password) {
      errors.password = 'Password is required.';
    }
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    const errors = validate();
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    try {
      setSubmitting(true);
      await login(identifier, password);
      const destination = location.state?.from?.pathname || '/dashboard';
      navigate(destination, { replace: true });
    } catch (err) {
      setErrorMessage(
        err.message || 'Authentication failed. Please verify your administrator credentials.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page-container">
      <div className="login-card">
        <div className="login-header">
          <div className="login-brand-icon">
            <ShieldCheck size={30} />
          </div>
          <h1 className="login-title">smartAssert</h1>
          <p className="login-subtitle">
            Sign in with your administrator account to manage enterprise hardware assets and software licenses.
          </p>
        </div>

        {errorMessage && (
          <div className="alert-banner alert-danger" role="alert" aria-live="assertive">
            <AlertCircle size={20} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <strong>Authentication Error: </strong>
              <span>{errorMessage}</span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="identifier-input" className="form-label">
              Username or Email Address
            </label>
            <input
              id="identifier-input"
              type="text"
              name="identifier"
              autoComplete="username"
              className={`form-input ${formErrors.identifier ? 'error' : ''}`}
              placeholder="e.g. admin or admin@enterprise.local"
              value={identifier}
              onChange={(e) => {
                setIdentifier(e.target.value);
                if (formErrors.identifier) {
                  setFormErrors((prev) => ({ ...prev, identifier: null }));
                }
              }}
              disabled={submitting}
              autoFocus
            />
            {formErrors.identifier && (
              <span className="form-error-text" role="alert">
                {formErrors.identifier}
              </span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="password-input" className="form-label">
              Administrator Password
            </label>
            <div className="input-wrapper">
              <input
                id="password-input"
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                className={`form-input ${formErrors.password ? 'error' : ''}`}
                placeholder="Enter password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (formErrors.password) {
                    setFormErrors((prev) => ({ ...prev, password: null }));
                  }
                }}
                disabled={submitting}
              />
              <button
                type="button"
                className="input-password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={0}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {formErrors.password && (
              <span className="form-error-text" role="alert">
                {formErrors.password}
              </span>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '8px' }}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <span className="spinner spinner-sm" aria-hidden="true"></span>
                <span>Authenticating...</span>
              </>
            ) : (
              <>
                <Lock size={16} />
                <span>Sign In to Console</span>
              </>
            )}
          </button>
        </form>

        <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--color-slate-400)' }}>
          Session tokens are securely transmitted via HttpOnly cookies.
        </div>
      </div>
    </div>
  );
}
