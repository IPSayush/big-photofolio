/**
 * Create Event Page — event creation form.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { Card, Button, Input } from '../../components/common';
import '../dashboard/dashboard.css';

export default function CreateEventPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    venue: '',
    dateStart: '',
    dateEnd: '',
    accessMode: 'invite',
    description: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const payload = {
        ...form,
        dateStart: new Date(form.dateStart).toISOString(),
        dateEnd: new Date(form.dateEnd).toISOString(),
      };
      const { data } = await api.post('/events', payload);
      navigate(`/events/${data.event._id || data.event.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create event.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Create Event</h1>
      </div>

      <Card style={{ maxWidth: 600 }}>
        <Card.Body>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            {error && <div className="auth-card__error">{error}</div>}

            <Input id="name" label="Event Name" placeholder="Wedding of John & Jane" value={form.name} onChange={update('name')} required />

            <Input id="venue" label="Venue" placeholder="Grand Ballroom, Mumbai" value={form.venue} onChange={update('venue')} required />

            <div className="auth-card__row">
              <Input id="dateStart" label="Start Date & Time" type="datetime-local" value={form.dateStart} onChange={update('dateStart')} required />
              <Input id="dateEnd" label="End Date & Time" type="datetime-local" value={form.dateEnd} onChange={update('dateEnd')} required />
            </div>

            <div className="input-group">
              <label htmlFor="accessMode" className="input-group__label">Access Mode</label>
              <select id="accessMode" className="input-group__input" value={form.accessMode} onChange={update('accessMode')}>
                <option value="invite">Invite Only (QR Required)</option>
                <option value="open">Open Access</option>
              </select>
            </div>

            <div className="input-group">
              <label htmlFor="description" className="input-group__label">Description (optional)</label>
              <textarea
                id="description"
                className="input-group__input"
                rows={3}
                placeholder="Add a note for this event..."
                value={form.description}
                onChange={update('description')}
                style={{ resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <Button type="submit" variant="primary" loading={loading}>Create Event</Button>
              <Button type="button" variant="ghost" onClick={() => navigate('/events')}>Cancel</Button>
            </div>
          </form>
        </Card.Body>
      </Card>
    </div>
  );
}
