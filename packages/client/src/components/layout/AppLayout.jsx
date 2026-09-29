/**
 * AppLayout — authenticated layout shell.
 * Sidebar nav + mobile bottom nav + content area. Mobile-first responsive.
 */

import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import './layout.css';

const NAV_ITEMS_PHOTOGRAPHER = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/events', label: 'Events', icon: '📷' },
  { to: '/subscription', label: 'Plan', icon: '💳' },
];

const NAV_ITEMS_ADMIN = [
  { to: '/admin', label: 'Admin', icon: '🛡' },
  { to: '/admin/tenants', label: 'Tenants', icon: '👥' },
  { to: '/admin/plans', label: 'Plans', icon: '📋' },
];

export default function AppLayout() {
  const { user, tenant, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Prevent body scroll when sidebar open
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = isAdmin ? NAV_ITEMS_ADMIN : NAV_ITEMS_PHOTOGRAPHER;

  return (
    <div className="app-layout">
      {/* Mobile menu toggle */}
      <button
        className="app-layout__menu-toggle"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle menu"
      >
        {sidebarOpen ? '✕' : '☰'}
      </button>

      {/* Sidebar overlay (mobile) */}
      {sidebarOpen && (
        <div className="sidebar-overlay sidebar-overlay--visible" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar--open' : ''}`}>
        <div className="sidebar__brand">
          <h1 className="sidebar__logo">
            📷 Photo<span className="sidebar__logo-accent">Folio</span>
          </h1>
        </div>

        <nav className="sidebar__nav">
          {navItems.map(({ to, label, icon }) => (
            <NavLink key={to} to={to} className="sidebar__link" onClick={() => setSidebarOpen(false)}>
              <span className="sidebar__link-icon">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__footer">
          <div className="sidebar__user">
            <div className="sidebar__user-avatar">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </div>
            <div className="sidebar__user-info">
              <div className="sidebar__user-name">{user?.firstName} {user?.lastName}</div>
              <div className="sidebar__user-tenant">{tenant?.businessName}</div>
            </div>
          </div>
          <button className="sidebar__logout" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="app-layout__main">
        <Outlet />
      </main>

      {/* Mobile bottom navigation */}
      <nav className="bottom-nav">
        {navItems.map(({ to, label, icon }) => (
          <NavLink key={to} to={to} className="bottom-nav__link">
            <span className="bottom-nav__link-icon">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
