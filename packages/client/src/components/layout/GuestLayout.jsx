/**
 * GuestLayout — minimal guest-facing layout.
 * No sidebar, mobile-optimized, centered content.
 */

import { Outlet } from 'react-router-dom';
import './layout.css';

export default function GuestLayout() {
  return (
    <div className="guest-layout">
      <header className="guest-layout__header">
        <h1 className="guest-layout__logo">Photo<span style={{color: "var(--color-primary)"}}>Folio</span></h1>
      </header>
      <main className="guest-layout__main">
        <Outlet />
      </main>
      <footer className="guest-layout__footer">
        <p>Powered by PhotoFolio — AI Event Photography</p>
      </footer>
    </div>
  );
}
