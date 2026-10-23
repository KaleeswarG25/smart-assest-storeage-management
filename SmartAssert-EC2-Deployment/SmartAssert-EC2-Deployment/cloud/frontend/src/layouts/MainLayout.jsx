import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Laptop,
  Users,
  KeyRound,
  Clock,
  Shield,
  FileBarChart,
  Settings,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  Server
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { healthApi } from '../api/healthApi';

const NAVIGATION_ITEMS = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/assets', label: 'Hardware Assets', icon: Laptop },
  { path: '/employees', label: 'Employees', icon: Users },
  { path: '/licenses', label: 'Software Licenses', icon: KeyRound },
  { path: '/license-expiry', label: 'License Expiry', icon: Clock },
  { path: '/warranty-expiry', label: 'Warranty Expiry', icon: Shield },
  { path: '/reports', label: 'Reports & Export', icon: FileBarChart },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export function MainLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [serverHealth, setServerHealth] = useState({ healthy: true, status: 'UP' });

  // Periodically check server health
  useEffect(() => {
    let isMounted = true;
    async function checkHealth() {
      try {
        const data = await healthApi.getHealth();
        if (isMounted) setServerHealth(data);
      } catch {
        if (isMounted) setServerHealth({ healthy: false, status: 'DOWN' });
      }
    }

    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  // Determine current page title
  const currentNav = NAVIGATION_ITEMS.find((item) => item.path === location.pathname);
  const pageTitle = currentNav ? currentNav.label : 'Enterprise Management';

  // Extract initials for avatar
  const displayName = user?.fullName || user?.full_name || user?.username || 'Administrator';
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="app-container">
      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="brand-icon-box">
            <ShieldCheck size={22} />
          </div>
          <div className="brand-title">SmartAssert</div>
          {mobileMenuOpen && (
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="mobile-menu-btn"
              style={{ marginLeft: 'auto' }}
              aria-label="Close menu"
            >
              <X size={20} color="#cbd5e1" />
            </button>
          )}
        </div>

        <nav className="sidebar-nav" aria-label="Main Navigation">
          {NAVIGATION_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                <Icon size={18} className="nav-icon" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="system-status-indicator">
            <span
              className={`status-dot ${serverHealth.healthy ? '' : 'offline'}`}
              aria-hidden="true"
            ></span>
            <span>Backend: {serverHealth.healthy ? 'Online (SQLite)' : 'Disconnected'}</span>
          </div>
          <div style={{ color: 'var(--color-slate-500)', fontSize: '0.72rem' }}>
            Academic Stage A &bull; &#8377;0 Cloud Spend
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="main-content">
        <header className="top-header">
          <div className="header-left">
            <button
              className="mobile-menu-btn"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle Navigation Menu"
            >
              <Menu size={20} />
            </button>
            <h1 className="header-page-title">{pageTitle}</h1>
          </div>

          <div className="header-right">
            <div className="user-profile-badge">
              <div className="avatar-circle">{initials}</div>
              <span className="user-name" style={{ paddingRight: '6px' }}>{displayName}</span>
            </div>

            <button
              onClick={handleLogout}
              className="btn-logout"
              title="Sign out of system"
              aria-label="Sign out"
            >
              <LogOut size={16} />
              <span>Logout</span>
            </button>
          </div>
        </header>

        <main className="content-body">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
