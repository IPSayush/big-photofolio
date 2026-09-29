/**
 * Guest Landing Page — QR scan landing.
 * QR-A: Public event → view all photos directly
 * QR-B: Consent required → redirect to consent page
 */

import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { Card, Badge, Spinner, Button } from '../../components/common';
import './guest.css';

export default function GuestLandingPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [qrType, setQrType] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/guest/events/${token}`)
      .then(({ data }) => {
        setEvent(data.event);
        setQrType(data.qrType);
        
        // For QR-A public events, try to load photos
        if (data.qrType === 'A' && data.event?.stats?.photoCount > 0) {
          setPhotosLoading(true);
          api.get(`/guest/events/${token}/photos`)
            .then(({ data: photoData }) => {
              setPhotos(photoData.photos || []);
            })
            .catch(() => {
              // Photos endpoint may not exist yet — that's ok
              console.log('Could not load photos for QR-A event');
            })
            .finally(() => setPhotosLoading(false));
        }
      })
      .catch((err) => setError(err.response?.data?.error || 'Event not found'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <div className="page-center"><Spinner size="lg" /></div>;

  if (error) {
    return (
      <div className="guest-error">
        <div className="guest-error__icon">❌</div>
        <h2>Event Not Found</h2>
        <p>{error}</p>
      </div>
    );
  }

  const startDate = event.date?.start || event.dateStart;
  const formattedDate = startDate
    ? new Date(startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'Date not set';

  return (
    <div className="guest-landing">
      <div className="guest-landing__header">
        <Badge variant="success">Live Event</Badge>
        <h1 className="guest-landing__title">{event.name || event.title}</h1>
        {(event.venue || event.location) && (
          <p className="guest-landing__venue">📍 {event.venue || event.location}</p>
        )}
        <p className="guest-landing__date">📅 {formattedDate}</p>
      </div>

      {/* CTA Card */}
      <Card className="guest-landing__cta">
        <Card.Body>
          {qrType === 'B' ? (
            <>
              <h2>📷 Find Your Photos</h2>
              <p>Upload a selfie and our AI will find all photos you appear in!</p>
              <Link to={`/guest/consent/${token}`} style={{display:'block', width:'100%', textDecoration:'none'}}>
                <Button variant="primary" size="lg" fullWidth>
                  Get My Photos
                </Button>
              </Link>
            </>
          ) : (
            <>
              <h2>📸 Event Gallery</h2>
              <p>{event.stats?.photoCount > 0 
                ? `This event has ${event.stats.photoCount} photos. Browse the full gallery below!`
                : 'Photos are being uploaded. Check back soon!'
              }</p>
            </>
          )}
        </Card.Body>
      </Card>

      {/* Stats */}
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

      {/* Photo grid for QR-A public events */}
      {qrType === 'A' && photos.length > 0 && (
        <div className="guest-photo-grid" style={{marginTop: 'var(--space-6)'}}>
          <h3 style={{marginBottom: 'var(--space-4)', fontWeight: 600}}>Event Photos</h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 'var(--space-3)',
          }}>
            {photos.map((photo, i) => (
              <div key={photo._id || i} style={{
                aspectRatio: '1',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                background: 'var(--color-surface)',
              }}>
                <img 
                  src={photo.thumbnailUrl || photo.url} 
                  alt={`Photo ${i + 1}`}
                  style={{width: '100%', height: '100%', objectFit: 'cover'}}
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {photosLoading && (
        <div style={{textAlign: 'center', padding: 'var(--space-8)'}}>
          <Spinner size="md" />
          <p style={{marginTop: 'var(--space-3)', color: 'var(--color-text-muted)'}}>Loading photos...</p>
        </div>
      )}
    </div>
  );
}
