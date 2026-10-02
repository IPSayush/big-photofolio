/**
 * Login Page - email + password authentication.
 */

import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Button, Input } from '../../components/common';
import './auth.css';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await login(form.email, form.password);
      // Admin users should be redirected to admin dashboard, not photographer dashboard
      const isAdminUser = data.user?.role === 'admin';
      const defaultPath = isAdminUser ? '/admin' : '/dashboard';
      const from = location.state?.from?.pathname || defaultPath;
      navigate(from, { replace: true });
    } catch (err) {
      // error can be string or object - always extract a string for display
      const errData = err.response?.data?.error;
      const errMsg = typeof errData === 'string' ? errData
        : errData?.message || 'Login failed. Please try again.';
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-card__header">
          <h1 className="auth-card__logo">Photo<span className="auth-card__logo-accent">Folio</span></h1>
          <p className="auth-card__subtitle">Welcome back</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-card__form">
          {error && <div className="auth-card__error">{error}</div>}

          <Input
            id="email"
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />

          <Input
            id="password"
            label="Password"
            type="password"
            placeholder="Enter your password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />

          <Button type="submit" variant="primary" fullWidth loading={loading} size="lg">
            Sign In
          </Button>
        </form>

        <div className="auth-card__footer">
          <p>Don't have an account? <Link to="/register">Create one</Link></p>
        </div>
      </div>
    </div>
  );
}