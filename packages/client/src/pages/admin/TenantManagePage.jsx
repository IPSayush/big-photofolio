/**
 * Tenant Management Page — FR-MON-003.
 * Admin suspend/reinstate tenants.
 */

import { useState, useEffect } from 'react';
import api from '../../api/client';
import { Card, Button, Spinner, Badge, Modal, Input } from '../../components/common';
import '../dashboard/dashboard.css';
import './admin.css';

export default function TenantManagePage() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [suspendModal, setSuspendModal] = useState(null);
  const [reason, setReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchTenants = () => {
    api.get('/admin/dashboard?limit=100')
      .then(({ data }) => setTenants(data.tenants))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchTenants(); }, []);

  const handleSuspend = async () => {
    if (!reason.trim()) return;
    setActionLoading(true);
    try {
      await api.post(`/admin/tenants/${suspendModal}/suspend`, { reason });
      setSuspendModal(null);
      setReason('');
      fetchTenants();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to suspend.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReinstate = async (tenantId) => {
    if (!confirm('Reinstate this tenant?')) return;
    setActionLoading(true);
    try {
      await api.post(`/admin/tenants/${tenantId}/reinstate`);
      fetchTenants();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to reinstate.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div className="page-center"><Spinner size="lg" /></div>;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Tenant Management</h1>
      </div>

      <Card>
        <Card.Body>
          <div className="tenant-table">
            <div className="tenant-table__header">
              <span>Business</span>
              <span>Email</span>
              <span>Plan</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
            {tenants.map((t) => (
              <div key={t._id} className="tenant-table__row">
                <span className="tenant-table__name">{t.businessName}</span>
                <span className="tenant-table__email">{t.contactEmail}</span>
                <span>{t.planId?.name || '—'}</span>
                <Badge variant={t.status === 'active' ? 'success' : 'error'}>{t.status}</Badge>
                <span>
                  {t.status === 'active' ? (
                    <Button variant="danger" size="sm" onClick={() => setSuspendModal(t._id)}>Suspend</Button>
                  ) : (
                    <Button variant="secondary" size="sm" onClick={() => handleReinstate(t._id)}>Reinstate</Button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </Card.Body>
      </Card>

      {/* Suspend Modal */}
      <Modal isOpen={!!suspendModal} onClose={() => setSuspendModal(null)} title="Suspend Tenant">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Input
            id="reason"
            label="Reason for suspension"
            placeholder="Abuse detected, non-payment, etc."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <Button variant="danger" onClick={handleSuspend} loading={actionLoading} disabled={!reason.trim()}>
              Confirm Suspend
            </Button>
            <Button variant="ghost" onClick={() => setSuspendModal(null)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
