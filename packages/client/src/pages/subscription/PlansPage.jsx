/**
 * Plans Page - list available plans for subscription.
 * FR-PLAN-002.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { Card, Button, Spinner, Badge } from '../../components/common';
import { CalendarDays, Camera, Users, Link2, HardDrive, CheckCircle } from '../../components/Icons';
import './subscription.css';

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(amount);
}

export default function PlansPage() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/plans')
      .then(({ data }) => setPlans(data.plans || []))
      .catch(() => setError('Failed to load plans.'))
      .finally(() => setLoading(false));
  }, []);

  const handleSubscribe = async (planId) => {
    setSubscribing(planId);
    setError('');
    try {
      await api.post('/subscriptions', { planId });
      navigate('/subscription');
    } catch (err) {
      const msg = err.response?.data?.error;
      setError(typeof msg === 'string' ? msg : msg?.message || 'Failed to subscribe.');
    } finally {
      setSubscribing(null);
    }
  };

  if (loading) return <div className="page-center"><Spinner size="lg" /></div>;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Choose a Plan</h1>
      </div>

      {error && <div className="auth-card__error" style={{ marginBottom: 'var(--space-4)' }}>{error}</div>}

      <div className="plans-grid">
        {plans.map((plan) => (
          <Card key={plan._id} className="plan-card">
            <Card.Body>
              <h2 className="plan-card__name">{plan.name}</h2>
              {plan.description && <p className="plan-card__desc">{plan.description}</p>}
              <div className="plan-card__price">
                <span className="plan-card__amount">{formatCurrency(plan.pricing.amount)}</span>
                <span className="plan-card__interval">/{plan.pricing.interval === 'yearly' ? 'year' : 'month'}</span>
              </div>
              <div className="plan-card__quotas">
                <div className="plan-card__quota-item">
                  <CalendarDays size={16} />
                  <span className="plan-card__quota-label">Events</span>
                  <span className="plan-card__quota-value">{plan.quotas.maxEvents}</span>
                </div>
                <div className="plan-card__quota-item">
                  <Camera size={16} />
                  <span className="plan-card__quota-label">Photos/Event</span>
                  <span className="plan-card__quota-value">{plan.quotas.maxPhotosPerEvent.toLocaleString()}</span>
                </div>
                <div className="plan-card__quota-item">
                  <Users size={16} />
                  <span className="plan-card__quota-label">Guests/Event</span>
                  <span className="plan-card__quota-value">{plan.quotas.maxGuestsPerEvent.toLocaleString()}</span>
                </div>
                <div className="plan-card__quota-item">
                  <Link2 size={16} />
                  <span className="plan-card__quota-label">AI Matches/mo</span>
                  <span className="plan-card__quota-value">{plan.quotas.maxAiMatchesPerMonth.toLocaleString()}</span>
                </div>
                <div className="plan-card__quota-item">
                  <HardDrive size={16} />
                  <span className="plan-card__quota-label">Storage</span>
                  <span className="plan-card__quota-value">{(plan.quotas.maxStorageBytes / 1073741824).toFixed(0)} GB</span>
                </div>
              </div>
              {plan.trialDays > 0 && (
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <Badge variant="info"><CheckCircle size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />{plan.trialDays}-Day Free Trial</Badge>
                </div>
              )}
              <Button
                variant="primary"
                fullWidth
                onClick={() => handleSubscribe(plan._id)}
                loading={subscribing === plan._id}
              >
                {plan.pricing.amount === 0 ? 'Start Free' : 'Subscribe'}
              </Button>
            </Card.Body>
          </Card>
        ))}
      </div>
    </div>
  );
}