import React from 'react';

/**
 * ErrorBoundary — catches unhandled React errors and shows a fallback UI
 * instead of a blank screen. Prevents the entire app from unmounting on error.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '2rem',
          background: 'var(--bg-primary, #0a0a0f)',
          color: 'var(--text-primary, #f0f0f5)',
          fontFamily: 'Inter, system-ui, sans-serif',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', fontWeight: 600 }}>
            Something went wrong
          </h1>
          <p style={{
            color: 'var(--text-secondary, #9999aa)',
            marginBottom: '1.5rem',
            maxWidth: '400px',
          }}>
            An unexpected error occurred. Please try refreshing the page.
          </p>
          <pre style={{
            background: 'rgba(255,255,255,0.05)',
            padding: '1rem',
            borderRadius: '8px',
            fontSize: '0.75rem',
            maxWidth: '500px',
            overflow: 'auto',
            marginBottom: '1.5rem',
            color: '#ff6b6b',
            textAlign: 'left',
          }}>
            {this.state.error?.message || 'Unknown error'}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.75rem 2rem',
              borderRadius: '8px',
              border: 'none',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }
    

    return this.props.children;
  }
}
