/**
 * Guest Landing Page — QR-A scan landing.
 * FR-GUEST-001: Event info + browsable gallery.
 */

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../api/client';
import { Card, Badge, Spinner, Button } from '../../components/common';
import './guest.css';

export default function GuestLandingPage() {
  const { token } = useParams();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/guest/events/${token}`)
      .then(({ data }) => setEvent(data.event))
      .catch((err) => setError(err.response?.data?.error || 'Event not found'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <div className="page-center"><Spinner size="lg" /></div>;

  if (error) {
    return (
      <div className="guest-error">
        <div className="guest-error__icon">😕</div>
        <h2>Event Not Found</h2>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="guest-landing">
      <div className="guest-landing__header">
        <Badge variant="success">Live Event</Badge>
        <h1 className="guest-landing__title">{event.name}</h1>
        <p className="guest-landing__venue">📍 {event.venue}</p>
        <p className="guest-landing__date">
          📅 {new Date(event.dateStart).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      <Card className="guest-landing__cta">
        <Card.Body>
          <h2>📸 Find Your Photos</h2>
          <p>Upload a selfie and our AI will find all photos you appear in!</p>
          <Link to={`/guest/consent/${token}`}>
            <Button variant="primary" size="lg" fullWidth>Get My Photos →</Button>
          </Link>
        </Card.Body>
      </Card>

      <div className="guest-landing__stats">
        <div className="guest-stat">
          <span className="guest-stat__value">{event.stats?.photoCount || 0}</span>
          <span className="guest-stat__label">Photos</span>
        </div>
        <div className="guest-stat">
          <span className="guest-stat__value">{event.stats?.guestCount || 0}</span>
          <span className="guest-stat__label">Guests</span>
        </div>
      </div>
    </div>
  );
}
