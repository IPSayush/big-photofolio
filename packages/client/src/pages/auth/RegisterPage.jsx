/**
 * Register Page — photographer account creation.
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Button, Input } from '../../components/common';
import './auth.css';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    businessName: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await register(form);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const data = err.response?.data;
      if (data?.details?.length) {
        // Show field-level messages from validate middleware (SEC-002)
        setError(data.details.map((d) => d.message).join(' • '));
      } else {
        setError(data?.error || 'Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-card__header">
          <h1 className="auth-card__logo">📸 PhotoFolio</h1>
          <p className="auth-card__subtitle">Create your account</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-card__form">
          {error && <div className="auth-card__error">{error}</div>}

          <div className="auth-card__row">
            <Input
              id="firstName"
              label="First Name"
              placeholder="John"
              value={form.firstName}
              onChange={update('firstName')}
              required
            />
            <Input
              id="lastName"
              label="Last Name"
              placeholder="Doe"
              value={form.lastName}
              onChange={update('lastName')}
              required
            />
          </div>

          <Input
            id="businessName"
            label="Business Name"
            placeholder="My Photography Studio"
            value={form.businessName}
            onChange={update('businessName')}
            required
          />

          <Input
            id="email"
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={update('email')}
            required
          />

          <Input
            id="password"
            label="Password"
            type="password"
            placeholder="Min. 8 chars, 1 uppercase, 1 lowercase, 1 digit"
            value={form.password}
            onChange={update('password')}
            minLength={8}
            required
          />

          <Button type="submit" variant="primary" fullWidth loading={loading} size="lg">
            Create Account
          </Button>
        </form>

        <div className="auth-card__footer">
          <p>Already have an account? <Link to="/login">Sign in</Link></p>
        </div>
      </div>
    </div>
  );
}
