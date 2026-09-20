/**
 * Plans Page — list available plans for subscription.
 * FR-PLAN-002.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { Card, Button, Spinner, Badge } from '../../components/common';
import './subscription.css';

export default function PlansPage() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(null);

  useEffect(() => {
    api.get('/plans')
      .then(({ data }) => setPlans(data.plans))
      .finally(() => setLoading(false));
  }, []);

  const handleSubscribe = async (planId) => {
    setSubscribing(planId);
    try {
      await api.post('/subscriptions', { planId });
      navigate('/subscription');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to subscribe.');
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

      <div className="plans-grid">
        {plans.map((plan) => (
          <Card key={plan._id} className="plan-card">
            <Card.Body>
              <h2 className="plan-card__name">{plan.name}</h2>
              <div className="plan-card__price">
                <span className="plan-card__amount">₹{plan.pricing.amount}</span>
                <span className="plan-card__interval">/{plan.pricing.interval === 'yearly' ? 'year' : 'month'}</span>
              </div>
              <ul className="plan-card__features">
                <li>📸 {plan.quotas.maxEvents} Events</li>
                <li>📷 {plan.quotas.maxPhotosPerEvent} Photos/Event</li>
                <li>👥 {plan.quotas.maxGuestsPerEvent} Guests/Event</li>
                <li>🤖 {plan.quotas.maxAiMatchesPerMonth} AI Matches/Month</li>
                <li>💾 {(plan.quotas.maxStorageBytes / 1073741824).toFixed(0)} GB Storage</li>
              </ul>
              {plan.trialDays > 0 && <Badge variant="info" style={{ marginBottom: 'var(--space-4)' }}>{plan.trialDays}-Day Free Trial</Badge>}
              <Button
                variant="primary"
                fullWidth
                onClick={() => handleSubscribe(plan._id)}
                loading={subscribing === plan._id}
              >
                Subscribe
              </Button>
            </Card.Body>
          </Card>
        ))}
      </div>
    </div>
  );
}
