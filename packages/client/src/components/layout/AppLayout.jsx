/**
 * AppLayout — authenticated layout shell.
 * Sidebar nav + header + content area. Responsive.
 */

import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import './layout.css';

export default function AppLayout() {
  const { user, tenant, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

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

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar--open' : ''}`}>
        <div className="sidebar__brand">
          <h1 className="sidebar__logo">📸 PhotoFolio</h1>
        </div>

        <nav className="sidebar__nav">
          {!isAdmin && (
            <>
              <NavLink to="/dashboard" className="sidebar__link" onClick={() => setSidebarOpen(false)}>
                <span className="sidebar__link-icon">📊</span>
                Dashboard
              </NavLink>
              <NavLink to="/events" className="sidebar__link" onClick={() => setSidebarOpen(false)}>
                <span className="sidebar__link-icon">🎉</span>
                Events
              </NavLink>
              <NavLink to="/subscription" className="sidebar__link" onClick={() => setSidebarOpen(false)}>
                <span className="sidebar__link-icon">💳</span>
                Subscription
              </NavLink>
            </>
          )}

          {isAdmin && (
            <>
              <NavLink to="/admin" className="sidebar__link" onClick={() => setSidebarOpen(false)}>
                <span className="sidebar__link-icon">🛡️</span>
                Admin Dashboard
              </NavLink>
              <NavLink to="/admin/tenants" className="sidebar__link" onClick={() => setSidebarOpen(false)}>
                <span className="sidebar__link-icon">👥</span>
                Tenants
              </NavLink>
            </>
          )}
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
            Logout
          </button>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main content */}
      <main className="app-layout__main">
        <Outlet />
      </main>
    </div>
  );
}
