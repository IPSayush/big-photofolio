/**
 * Subscription Page - current plan, usage, and cancel.
 * FR-PLAN-004.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { Card, Button, Spinner, Badge, StatCard } from '../../components/common';
import { CalendarDays, Camera, HardDrive, Users, Link2, CreditCard } from '../../components/Icons';
import '../dashboard/dashboard.css';
import './subscription.css';

function iconEl(IconComp) {
  return <IconComp size={22} />;
}

export default function SubscriptionPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  const fetchSub = () => {
    api.get('/subscriptions/current')
      .then(({ data }) => setData(data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchSub(); }, []);

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel your subscription?')) return;
    setCancelling(true);
    try {
      await api.post('/subscriptions/cancel', { reason: 'User initiated' });
      fetchSub();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to cancel.');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) return <div className="page-center"><Spinner size="lg" /></div>;

  const { subscription, plan, usage } = data || {};

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Subscription</h1>
        <Link to="/plans"><Button variant="secondary">{subscription ? 'Change Plan' : 'Choose Plan'}</Button></Link>
      </div>

      {!subscription ? (
        <Card>
          <Card.Body>
            <div className="empty-state">
              <div className="empty-state__icon"><CreditCard size={48} /></div>
              <h3 className="empty-state__title">No Active Subscription</h3>
              <p className="empty-state__desc">Choose a plan to unlock all features.</p>
              <Link to="/plans"><Button variant="primary">View Plans</Button></Link>
            </div>
          </Card.Body>
        </Card>
      ) : (
        <>
          <Card className="sub-card">
            <Card.Body>
              <div className="sub-card__header">
                <div>
                  <h2 className="sub-card__plan">{subscription.planName}</h2>
                  <Badge variant={subscription.status === 'active' ? 'success' : subscription.status === 'trialing' ? 'info' : 'warning'}>
                    {subscription.status}
                  </Badge>
                </div>
                {(subscription.status === 'active' || subscription.status === 'trialing') && (
                  <Button variant="danger" size="sm" onClick={handleCancel} loading={cancelling}>Cancel</Button>
                )}
              </div>
              {subscription.currentPeriodEnd && (
                <p className="sub-card__period">
                  Current period ends: {new Date(subscription.currentPeriodEnd).toLocaleDateString('en-IN')}
                </p>
              )}
            </Card.Body>
          </Card>

          {usage && (
            <div style={{ marginTop: 'var(--space-6)' }}>
              <h2 className="section-title">Usage</h2>
              <div className="stats-grid">
                <StatCard icon={iconEl(CalendarDays)} label="Events" value={usage.eventsUsed} />
                <StatCard icon={iconEl(Camera)} label="Photos" value={usage.photosUploaded} />
                <StatCard icon={iconEl(HardDrive)} label="Storage" value={formatBytes(usage.storageBytesUsed)} />
                <StatCard icon={iconEl(Users)} label="Guests" value={usage.guestsOnboarded} />
                <StatCard icon={iconEl(Link2)} label="Matches" value={usage.matchesGenerated} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
