/**
 * Event Detail Page — single event with QR codes, stats, and management.
 * FR-EVENT-006: Dashboard stats.
 */

import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { Card, StatCard, Badge, Button, Spinner } from '../../components/common';
import '../dashboard/dashboard.css';
import './events.css';

export default function EventDetailPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/events/${eventId}`)
      .then(({ data }) => setEvent(data.event))
      .catch(() => navigate('/events'))
      .finally(() => setLoading(false));
  }, [eventId]);

  if (loading) return <div className="page-center"><Spinner size="lg" /></div>;
  if (!event) return null;

  const stats = event.stats || {};

  return (
    <div className="event-detail">
      <div className="page-header">
        <div>
          <Link to="/events" className="event-detail__back">← Back to Events</Link>
          <h1 className="page-title">{event.name}</h1>
        </div>
        <Badge variant={event.status === 'active' ? 'success' : 'default'} className="event-detail__badge">
          {event.status}
        </Badge>
      </div>

      {/* Event Info */}
      <div className="event-detail__info">
        <Card>
          <Card.Body>
            <div className="event-info-grid">
              <div><span className="event-info__label">📍 Venue</span><span>{event.venue}</span></div>
              <div><span className="event-info__label">📅 Start</span><span>{new Date(event.dateStart).toLocaleString('en-IN')}</span></div>
              <div><span className="event-info__label">📅 End</span><span>{new Date(event.dateEnd).toLocaleString('en-IN')}</span></div>
              <div><span className="event-info__label">🔑 Access</span><span>{event.accessMode}</span></div>
            </div>
          </Card.Body>
        </Card>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginTop: 'var(--space-6)' }}>
        <StatCard icon="📷" label="Photos" value={stats.photoCount || 0} />
        <StatCard icon="✅" label="Processed" value={stats.processedPhotoCount || 0} />
        <StatCard icon="❌" label="Failed" value={stats.failedPhotoCount || 0} />
        <StatCard icon="👥" label="Guests" value={stats.guestCount || 0} />
        <StatCard icon="🤖" label="Matches" value={stats.matchCount || 0} />
        <StatCard icon="💾" label="Storage" value={formatBytes(stats.storageUsedBytes || 0)} />
      </div>

      {/* QR Codes */}
      <div className="event-detail__qr-section">
        <h2 className="section-title" style={{ marginTop: 'var(--space-6)' }}>QR Codes</h2>
        <div className="qr-grid">
          <Card>
            <Card.Body>
              <h3 className="qr-card__title">QR-A: Browse Gallery</h3>
              <p className="qr-card__desc">Guests can browse the event's public gallery</p>
              <div className="qr-card__token">
                <code>{event.qrAToken}</code>
              </div>
              <p className="qr-card__url">{window.location.origin}/guest/events/{event.qrAToken}</p>
            </Card.Body>
          </Card>
          <Card>
            <Card.Body>
              <h3 className="qr-card__title">QR-B: AI Face Matching</h3>
              <p className="qr-card__desc">Guests consent and upload selfie for AI matching</p>
              <div className="qr-card__token">
                <code>{event.qrBToken}</code>
              </div>
              <p className="qr-card__url">{window.location.origin}/guest/consent/{event.qrBToken}</p>
            </Card.Body>
          </Card>
        </div>
      </div>

      {/* Actions */}
      <div className="event-detail__actions">
        <Link to={`/events/${eventId}/upload`}>
          <Button variant="primary" size="lg">📤 Upload Photos</Button>
        </Link>
      </div>
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
