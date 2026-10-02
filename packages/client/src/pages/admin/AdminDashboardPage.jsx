/**
 * Admin Dashboard â€” FR-MON-002.
 * Platform-wide metrics, tenant list, plan distribution.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { Card, StatCard, Spinner, Button, Badge } from '../../components/common';
import '../dashboard/dashboard.css';
import './admin.css';

export default function AdminDashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/dashboard')
      .then(({ data }) => setData(data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page-center"><Spinner size="lg" /></div>;
  if (!data) return null;

  const { platform, planDistribution, tenants, pagination } = data;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Admin Dashboard</h1>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <Link to="/admin/tenants"><Button variant="secondary" size="sm">Tenants</Button></Link>
          <Link to="/admin/plans"><Button variant="secondary" size="sm">Plans</Button></Link>
        </div>
      </div>

      {/* Platform Stats */}
      <div className="stats-grid">
        <StatCard icon="ðŸ¢" label="Total Tenants" value={platform.totalTenants} />
        <StatCard icon="âœ…" label="Active" value={platform.activeTenants} />
        <StatCard icon="â›”" label="Suspended" value={platform.suspendedTenants} />
        <StatCard icon="ðŸŽ‰" label="Events" value={platform.totalEvents} />
        <StatCard icon="ðŸ“·" label="Photos" value={platform.totalPhotos} />
        <StatCard icon="âœ…" label="Processed" value={platform.processedPhotos} />
        <StatCard icon="ðŸ‘¥" label="Guests" value={platform.totalGuests} />
        <StatCard icon="ðŸ¤–" label="Matches" value={platform.totalMatches} />
      </div>

      {/* Plan Distribution */}
      {planDistribution.length > 0 && (
        <Card style={{ marginBottom: 'var(--space-8)' }}>
          <Card.Header><h2 className="section-title" style={{ margin: 0 }}>Plan Distribution</h2></Card.Header>
          <Card.Body>
            <div className="plan-dist">
              {planDistribution.map((pd, i) => (
                <div key={i} className="plan-dist__item">
                  <span className="plan-dist__name">{pd.planName}</span>
                  <Badge variant="primary">{pd.count} subscribers</Badge>
                </div>
              ))}
            </div>
          </Card.Body>
        </Card>
      )}

      {/* Recent Tenants */}
      <Card>
        <Card.Header><h2 className="section-title" style={{ margin: 0 }}>Recent Tenants</h2></Card.Header>
        <Card.Body>
          <div className="tenant-table">
            <div className="tenant-table__header">
              <span>Business</span>
              <span>Email</span>
              <span>Plan</span>
              <span>Status</span>
              <span>Joined</span>
            </div>
            {tenants.map((t) => (
              <div key={t._id} className="tenant-table__row">
                <span className="tenant-table__name">{t.businessName}</span>
                <span className="tenant-table__email">{t.contactEmail}</span>
                <span>{t.planId?.name || 'â€”'}</span>
                <Badge variant={t.status === 'active' ? 'success' : 'error'}>{t.status}</Badge>
                <span className="tenant-table__date">{new Date(t.createdAt).toLocaleDateString('en-IN')}</span>
              </div>
            ))}
          </div>
        </Card.Body>
      </Card>
    </div>
  );
}
