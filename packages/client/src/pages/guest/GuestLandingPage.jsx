/**
 * Guest Landing Page — QR scan landing.
 * QR-A: Public event → browse all event photos
 * QR-B: Consent required → link to consent page
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
  const [pagination, setPagination] = useState(null);

  useEffect(() => {
    api.get(`/guest/events/${token}`)
      .then(({ data }) => {
        setEvent(data.event);
        setQrType(data.qrType);
        
        // For QR-A, load browsable gallery
        if (data.qrType === 'A') {
          loadPhotos();
        }
      })
      .catch((err) => setError(err.response?.data?.error || 'Event not found'))
      .finally(() => setLoading(false));
  }, [token]);

  const loadPhotos = (page = 1) => {
    setPhotosLoading(true);
    // Correct endpoint: /guest/events/:token/gallery (NOT /photos)
    api.get(`/guest/events/${token}/gallery?page=${page}&limit=20`)
      .then(({ data }) => {
        setPhotos(prev => page === 1 ? (data.photos || []) : [...prev, ...(data.photos || [])]);
        setPagination(data.pagination || null);
      })
      .catch((err) => {
        console.error('Gallery load error:', err);
        // Don't show error to user - photos may just not be processed yet
      })
      .finally(() => setPhotosLoading(false));
  };

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
  
  const photoCount = event.stats?.photoCount || 0;
  const processedCount = event.stats?.processedPhotoCount || 0;

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
              <h2 style={{marginBottom: 'var(--space-2)'}}>📷 Find Your Photos</h2>
              <p style={{color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)'}}>
                Upload a selfie and our AI will find all photos you appear in!
              </p>
              <Link to={`/guest/consent/${token}`} style={{display:'block', width:'100%', textDecoration:'none'}}>
                <Button variant="primary" size="lg" fullWidth>
                  Get My Photos →
                </Button>
              </Link>
            </>
          ) : (
            <>
              <h2 style={{marginBottom: 'var(--space-2)'}}>📸 Event Gallery</h2>
              <p style={{color: 'var(--color-text-secondary)'}}>
                {photos.length > 0 
                  ? `Showing ${photos.length} of ${photoCount} event photos`
                  : photoCount > 0 && processedCount === 0
                    ? `${photoCount} photos uploaded — they are being processed. Please check back in a few minutes!`
                    : photoCount > 0
                      ? `This event has ${photoCount} photos. Loading gallery...`
                      : 'Photos are being uploaded. Check back soon!'
                }
              </p>
            </>
          )}
        </Card.Body>
      </Card>

      {/* Stats */}
      <div className="guest-landing__stats">
        <div className="guest-stat">
          <span className="guest-stat__value">{photoCount}</span>
          <span className="guest-stat__label">Photos</span>
        </div>
        <div className="guest-stat">
          <span className="guest-stat__value">{event.stats?.guestCount || 0}</span>
          <span className="guest-stat__label">Guests</span>
        </div>
      </div>

      {/* Photo grid for QR-A */}
      {qrType === 'A' && photos.length > 0 && (
        <div style={{marginTop: 'var(--space-6)'}}>
          <h3 style={{marginBottom: 'var(--space-4)', fontWeight: 600, fontSize: 'var(--font-size-lg)'}}>
            🖼️ Gallery
          </h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 'var(--space-3)',
          }}>
            {photos.map((photo, i) => {
              const imgUrl = photo.derivatives?.web || photo.derivatives?.thumbnail || photo.derivatives?.watermarked || photo.derivatives?.original || '';
              return (
                <div key={photo.id || i} style={{
                  aspectRatio: '1',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                }}>
                  {imgUrl ? (
                    <img 
                      src={imgUrl} 
                      alt={`Photo ${i + 1}`}
                      style={{width: '100%', height: '100%', objectFit: 'cover'}}
                      loading="lazy"
                    />
                  ) : (
                    <div style={{
                      width: '100%', height: '100%', 
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)'
                    }}>
                      Processing...
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Load More */}
          {pagination && pagination.page < pagination.pages && (
            <div style={{textAlign: 'center', marginTop: 'var(--space-6)'}}>
              <Button 
                variant="secondary" 
                onClick={() => loadPhotos(pagination.page + 1)}
                loading={photosLoading}
              >
                Load More Photos
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Processing notice for QR-A when photos uploaded but not processed */}
      {qrType === 'A' && photos.length === 0 && photoCount > 0 && !photosLoading && (
        <Card style={{marginTop: 'var(--space-6)', textAlign: 'center'}}>
          <Card.Body>
            <div style={{fontSize: '2rem', marginBottom: 'var(--space-3)'}}>⏳</div>
            <h3 style={{marginBottom: 'var(--space-2)'}}>Photos Processing</h3>
            <p style={{color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)'}}>
              {photoCount} photos have been uploaded but are still being processed. 
              This usually takes a few minutes.
            </p>
            <Button variant="secondary" onClick={() => loadPhotos(1)}>
              🔄 Refresh Gallery
            </Button>
          </Card.Body>
        </Card>
      )}

      {photosLoading && photos.length === 0 && (
        <div style={{textAlign: 'center', padding: 'var(--space-8)'}}>
          <Spinner size="md" />
          <p style={{marginTop: 'var(--space-3)', color: 'var(--color-text-muted)'}}>Loading photos...</p>
        </div>
      )}
    </div>
  );
}
