import { BrowserRouter, Routes, Route } from 'react-router-dom';

/**
 * App root — routing shell.
 * Phase 1: Only auth pages exist. More routes added in later phases.
 */
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPlaceholder />} />
        {/* Phase 1 auth routes will be added here */}
      </Routes>
    </BrowserRouter>
  );
}

/** Temporary landing — replaced in Phase 2 with real UI */
function LandingPlaceholder() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      gap: '1rem',
    }}>
      <h1 style={{
        fontSize: 'var(--font-size-4xl)',
        fontWeight: 'var(--font-weight-extrabold)',
        background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
      }}>
        PhotoFolio
      </h1>
      <p style={{ color: 'var(--color-text-secondary)' }}>
        AI-Powered Event Photography Platform
      </p>
      <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
        Phase 1 — Foundation & Auth (in progress)
      </p>
    </div>
  );
}

export default App;
