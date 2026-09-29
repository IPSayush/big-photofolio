/**
 * AppLayout — authenticated layout shell.
 * Sidebar nav + top header bar + mobile bottom nav + content area.
 * Mobile-first responsive.
 */

import { useState, useEffect, useRef } from 'react';
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
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
    setUserMenuOpen(false);
  }, [location.pathname]);

  // Prevent body scroll when sidebar open
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);

  // Close user menu on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = isAdmin ? NAV_ITEMS_ADMIN : NAV_ITEMS_PHOTOGRAPHER;
  const initials = (user?.firstName?.[0] || '') + (user?.lastName?.[0] || '');

  return (
    <div className="app-layout">
      {/* ======= Top header bar (always visible) ======= */}
      <header className="app-header">
        {/* Left: hamburger (mobile) or brand (desktop) */}
        <div className="app-header__left">
          <button
            className="app-header__hamburger"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          <span className="app-header__brand">
            Photo<span className="app-header__brand-accent">Folio</span>
          </span>
        </div>

        {/* Right: user avatar + dropdown */}
        <div className="app-header__right" ref={userMenuRef}>
          <button
            className="app-header__avatar"
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            aria-label="User menu"
          >
            {initials || '?'}
          </button>

          {userMenuOpen && (
            <div className="user-dropdown">
              <div className="user-dropdown__info">
                <div className="user-dropdown__name">{user?.firstName} {user?.lastName}</div>
                <div className="user-dropdown__tenant">{tenant?.businessName}</div>
              </div>
              <div className="user-dropdown__divider" />
              <button className="user-dropdown__item user-dropdown__logout" onClick={handleLogout}>
                Sign Out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ======= Sidebar overlay (mobile) ======= */}
      {sidebarOpen && (
        <div className="sidebar-overlay sidebar-overlay--visible" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ======= Sidebar ======= */}
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
              {initials}
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

      {/* ======= Main content ======= */}
      <main className="app-layout__main">
        <Outlet />
      </main>

      {/* ======= Mobile bottom navigation ======= */}
      <nav className="bottom-nav">
        {navItems.map(({ to, label, icon }) => (
          <NavLink key={to} to={to} className="bottom-nav__link">
            <span className="bottom-nav__link-icon">{icon}</span>
            {label}
          </NavLink>
        ))}
        {/* More button opens sidebar with logout */}
        <button className="bottom-nav__link" onClick={() => setSidebarOpen(true)}>
          <span className="bottom-nav__link-icon">☰</span>
          More
        </button>
      </nav>
    </div>
  );
}
