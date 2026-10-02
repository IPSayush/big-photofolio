/**
 * Plan Management Page - FR-PLAN-001, API-010.
 * Admin can create, edit, archive, and restore subscription plans.
 */

import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import { Card, Button, Spinner, Badge, Modal, Input } from '../../components/common';
import { CheckCircle, XCircle, CalendarDays, Camera, Users, HardDrive, Link2 } from '../../components/Icons';
import '../dashboard/dashboard.css';
import './admin.css';

const GB = 1073741824;

const EMPTY_FORM = {
  name: '',
  description: '',
  pricing: { amount: '', currency: 'INR', interval: 'monthly' },
  quotas: {
    maxEvents: '',
    maxPhotosPerEvent: '',
    maxStorageBytes: '',
    maxGuestsPerEvent: '',
    maxAiMatchesPerMonth: '',
  },
  features: {
    originalDownload: false,
    customBranding: false,
    watermarkRemoval: false,
    priorityProcessing: false,
  },
  trialDays: 0,
  sortOrder: 0,
};

function toPayload(form) {
  return {
    ...form,
    pricing: { ...form.pricing, amount: Number(form.pricing.amount) },
    quotas: {
      maxEvents: Number(form.quotas.maxEvents),
      maxPhotosPerEvent: Number(form.quotas.maxPhotosPerEvent),
      maxStorageBytes: Number(form.quotas.maxStorageBytes) * GB,
      maxGuestsPerEvent: Number(form.quotas.maxGuestsPerEvent),
      maxAiMatchesPerMonth: Number(form.quotas.maxAiMatchesPerMonth),
    },
    trialDays: Number(form.trialDays),
    sortOrder: Number(form.sortOrder),
  };
}

function toForm(plan) {
  return {
    name: plan.name,
    description: plan.description || '',
    pricing: { ...plan.pricing },
    quotas: {
      maxEvents: String(plan.quotas.maxEvents),
      maxPhotosPerEvent: String(plan.quotas.maxPhotosPerEvent),
      maxStorageBytes: String(Math.round(plan.quotas.maxStorageBytes / GB)),
      maxGuestsPerEvent: String(plan.quotas.maxGuestsPerEvent),
      maxAiMatchesPerMonth: String(plan.quotas.maxAiMatchesPerMonth),
    },
    features: { ...plan.features },
    trialDays: plan.trialDays,
    sortOrder: plan.sortOrder ?? 0,
  };
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(amount);
}

export default function PlanManagePage() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [togglingId, setTogglingId] = useState(null);

  const fetchPlans = useCallback(() => {
    api.get('/admin/plans')
      .then(({ data }) => setPlans(data.plans || data))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError('');
    setEditTarget(null);
    setModal('create');
  };

  const openEdit = (plan) => {
    setForm(toForm(plan));
    setFormError('');
    setEditTarget(plan);
    setModal('edit');
  };

  const closeModal = () => { setModal(null); setEditTarget(null); setFormError(''); };

  const setField = (path, value) => {
    setForm((prev) => {
      const copy = JSON.parse(JSON.stringify(prev));
      const keys = path.split('.');
      let cur = copy;
      for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]];
      cur[keys[keys.length - 1]] = value;
      return copy;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setFormError('');
    try {
      const payload = toPayload(form);
      if (modal === 'create') {
        await api.post('/admin/plans', payload);
      } else {
        await api.put(`/admin/plans/${editTarget._id}`, payload);
      }
      closeModal();
      fetchPlans();
    } catch (err) {
      const data = err.response?.data;
      if (data?.details?.length) {
        setFormError(data.details.map((d) => d.message).join(' \u2022 '));
      } else {
        const errData = data?.error;
        setFormError(typeof errData === 'string' ? errData : errData?.message || 'Save failed.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (plan) => {
    if (!confirm(`${plan.isActive ? 'Archive' : 'Restore'} plan "${plan.name}"?`)) return;
    setTogglingId(plan._id);
    try {
      await api.patch(`/admin/plans/${plan._id}/status`, { isActive: !plan.isActive });
      fetchPlans();
    } catch (err) {
      alert(err.response?.data?.error || 'Action failed.');
    } finally {
      setTogglingId(null);
    }
  };

  if (loading) return <div className="page-center"><Spinner size="lg" /></div>;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Plan Management</h1>
        <Button id="btn-create-plan" variant="primary" onClick={openCreate}>+ New Plan</Button>
      </div>

      {plans.length === 0 ? (
        <Card>
          <Card.Body>
            <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
              <div className="empty-state__icon"><CalendarDays size={48} /></div>
              <p className="empty-state__desc">No plans yet. Create your first plan.</p>
            </div>
          </Card.Body>
        </Card>
      ) : (
        <div className="plan-cards-grid">
          {plans.map((plan) => (
            <Card key={plan._id} className={`plan-card ${!plan.isActive ? 'plan-card--archived' : ''}`}>
              <Card.Body>
                {/* Header */}
                <div className="plan-card__header">
                  <div>
                    <h3 className="plan-card__name">{plan.name}</h3>
                    {plan.description && <p className="plan-card__desc">{plan.description}</p>}
                  </div>
                  <Badge variant={plan.isActive ? 'success' : 'warning'}>
                    {plan.isActive ? 'Active' : 'Archived'}
                  </Badge>
                </div>

                {/* Price */}
                <div className="plan-card__price">
                  <span className="plan-card__amount">{formatCurrency(plan.pricing.amount)}</span>
                  <span className="plan-card__interval">/{plan.pricing.interval === 'yearly' ? 'year' : 'month'}</span>
                </div>

                {/* Quotas */}
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
                    <HardDrive size={16} />
                    <span className="plan-card__quota-label">Storage</span>
                    <span className="plan-card__quota-value">{Math.round(plan.quotas.maxStorageBytes / GB)} GB</span>
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
                  {plan.trialDays > 0 && (
                    <div className="plan-card__quota-item">
                      <CheckCircle size={16} />
                      <span className="plan-card__quota-label">Free Trial</span>
                      <span className="plan-card__quota-value">{plan.trialDays} days</span>
                    </div>
                  )}
                </div>

                {/* Features */}
                {plan.features && (
                  <div className="plan-card__features">
                    {Object.entries(plan.features).map(([key, enabled]) => (
                      <div key={key} className={`plan-card__feature ${enabled ? '' : 'plan-card__feature--disabled'}`}>
                        {enabled ? <CheckCircle size={14} /> : <XCircle size={14} />}
                        <span>{key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="plan-card__actions">
                  <Button id={`btn-edit-${plan._id}`} variant="secondary" size="sm" onClick={() => openEdit(plan)}>Edit</Button>
                  <Button
                    id={`btn-toggle-${plan._id}`}
                    variant={plan.isActive ? 'danger' : 'secondary'}
                    size="sm"
                    loading={togglingId === plan._id}
                    onClick={() => handleToggle(plan)}
                  >
                    {plan.isActive ? 'Archive' : 'Restore'}
                  </Button>
                </div>
              </Card.Body>
            </Card>
          ))}
        </div>
      )}

      <Modal
        isOpen={!!modal}
        onClose={closeModal}
        title={modal === 'create' ? 'Create New Plan' : `Edit Plan: ${editTarget?.name}`}
      >
        <div className="plan-form">
          {formError && (
            <div className="auth-card__error" style={{ marginBottom: 'var(--space-4)' }}>{formError}</div>
          )}

          <div className="plan-form__section-title">Basic Info</div>
          <div className="plan-form__row">
            <Input id="pf-name" label="Plan Name" value={form.name} onChange={(e) => setField('name', e.target.value)} required />
            <Input id="pf-sort" label="Sort Order" type="number" value={form.sortOrder} onChange={(e) => setField('sortOrder', e.target.value)} />
          </div>
          <Input id="pf-desc" label="Description" value={form.description} onChange={(e) => setField('description', e.target.value)} />

          <div className="plan-form__section-title">Pricing</div>
          <div className="plan-form__row">
            <Input id="pf-amount" label="Amount (INR)" type="number" min="0" value={form.pricing.amount} onChange={(e) => setField('pricing.amount', e.target.value)} required />
            <div className="plan-form__field">
              <label className="input__label" htmlFor="pf-interval">Interval</label>
              <select id="pf-interval" className="plan-form__select" value={form.pricing.interval} onChange={(e) => setField('pricing.interval', e.target.value)}>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <Input id="pf-trial" label="Trial Days" type="number" min="0" value={form.trialDays} onChange={(e) => setField('trialDays', e.target.value)} />
          </div>

          <div className="plan-form__section-title">Quotas</div>
          <div className="plan-form__row">
            <Input id="pf-events" label="Max Events" type="number" min="1" value={form.quotas.maxEvents} onChange={(e) => setField('quotas.maxEvents', e.target.value)} required />
            <Input id="pf-photos" label="Photos / Event" type="number" min="1" value={form.quotas.maxPhotosPerEvent} onChange={(e) => setField('quotas.maxPhotosPerEvent', e.target.value)} required />
          </div>
          <div className="plan-form__row">
            <Input id="pf-storage" label="Storage (GB)" type="number" min="1" value={form.quotas.maxStorageBytes} onChange={(e) => setField('quotas.maxStorageBytes', e.target.value)} required />
            <Input id="pf-guests" label="Guests / Event" type="number" min="1" value={form.quotas.maxGuestsPerEvent} onChange={(e) => setField('quotas.maxGuestsPerEvent', e.target.value)} required />
            <Input id="pf-ai" label="AI Matches / Month" type="number" min="0" value={form.quotas.maxAiMatchesPerMonth} onChange={(e) => setField('quotas.maxAiMatchesPerMonth', e.target.value)} required />
          </div>

          <div className="plan-form__section-title">Features</div>
          <div className="plan-form__features">
            {Object.entries(form.features).map(([key, val]) => (
              <label key={key} className="plan-form__checkbox">
                <input type="checkbox" checked={val} onChange={(e) => setField(`features.${key}`, e.target.checked)} />
                <span>{key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}</span>
              </label>
            ))}
          </div>

          <div className="plan-form__footer">
            <Button id="btn-save-plan" variant="primary" onClick={handleSave} loading={saving}>
              {modal === 'create' ? 'Create Plan' : 'Save Changes'}
            </Button>
            <Button variant="ghost" onClick={closeModal}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}