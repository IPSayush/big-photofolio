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
    accessMode: 'link_only',
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
        name: form.name,
        venue: form.venue || undefined,
        dateStart: new Date(form.dateStart).toISOString(),
        accessMode: form.accessMode,
      };

      // Only include dateEnd if user filled it in
      if (form.dateEnd) {
        payload.dateEnd = new Date(form.dateEnd).toISOString();
      }

      const { data } = await api.post('/events', payload);
      navigate(`/events/${data.event._id || data.event.id}`);
    } catch (err) {
      const details = err.response?.data?.details;
      if (details && details.length) {
        setError(details.map((d) => `${d.field}: ${d.message}`).join('; '));
      } else {
        setError(err.response?.data?.error || 'Failed to create event.');
      }
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

            <Input id="venue" label="Venue" placeholder="Grand Ballroom, Mumbai" value={form.venue} onChange={update('venue')} />

            <div className="auth-card__row">
              <Input id="dateStart" label="Start Date & Time" type="datetime-local" value={form.dateStart} onChange={update('dateStart')} required />
              <Input id="dateEnd" label="End Date & Time (optional)" type="datetime-local" value={form.dateEnd} onChange={update('dateEnd')} />
            </div>

            <div className="input-group">
              <label htmlFor="accessMode" className="input-group__label">Access Mode</label>
              <select id="accessMode" className="input-group__input" value={form.accessMode} onChange={update('accessMode')}>
                <option value="link_only">Link Only (QR Required)</option>
                <option value="public_within_event">Public Within Event</option>
                <option value="find_my_photos_only">Find My Photos Only</option>
              </select>
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

