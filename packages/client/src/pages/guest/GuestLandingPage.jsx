/**
 * Guest Landing Page â€” QR scan landing.
 * QR-A: Public event â†’ browse all event photos with lightbox + download
 * QR-B: Consent required â†’ link to consent page
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../api/client';
import { Card, Badge, Spinner, Button } from '../../components/common';
import { Download, X, ChevronLeft, ChevronRight } from '../../components/Icons';
import './guest.css';

export default function GuestLandingPage() {
  const { token } = useParams();
  const [event, setEvent] = useState(null);
  const [qrType, setQrType] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [error, setError] = useState('');
  const [pagination, setPagination] = useState(null);

  // Lightbox state
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    api.get(`/guest/events/${token}`)
      .then(({ data }) => {
        setEvent(data.event);
        setQrType(data.qrType);
        if (data.qrType === 'A') {
          loadPhotos();
        }
      })
      .catch((err) => setError(err.response?.data?.error || 'Event not found'))
      .finally(() => setLoading(false));
  }, [token]);

  const loadPhotos = (page = 1) => {
    setPhotosLoading(true);
    api.get(`/guest/events/${token}/gallery?page=${page}&limit=50`)
      .then(({ data }) => {
        setPhotos(prev => page === 1 ? (data.photos || []) : [...prev, ...(data.photos || [])]);
        setPagination(data.pagination || null);
      })
      .catch(() => {})
      .finally(() => setPhotosLoading(false));
  };

  // Lightbox navigation
  const openLightbox = (index) => setLightboxIndex(index);
  const closeLightbox = () => setLightboxIndex(-1);
  const goNext = useCallback(() => {
    if (lightboxIndex < photos.length - 1) setLightboxIndex(lightboxIndex + 1);
  }, [lightboxIndex, photos.length]);
  const goPrev = useCallback(() => {
    if (lightboxIndex > 0) setLightboxIndex(lightboxIndex - 1);
  }, [lightboxIndex]);

  // Keyboard navigation
  useEffect(() => {
    if (lightboxIndex < 0) return;
    const handler = (e) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightboxIndex, goNext, goPrev]);

  // Download photo via server proxy (avoids S3 CORS issues)
  const handleDownload = async (photo) => {
    setDownloading(true);
    try {
      const downloadUrl = `/api/guest/photos/${photo.id}/download`;
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = photo.originalFileName || `photo-${photo.id}.jpg`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      // Fallback
      const url = photo.derivatives?.original || photo.derivatives?.watermarked || '';
      if (url) window.open(url, '_blank');
    } finally {
      setTimeout(() => setDownloading(false), 1000);
    }
  };

  if (loading) return <div className="page-center"><Spinner size="lg" /></div>;

  if (error) {
    return (
      <div className="guest-error">
        <div className="guest-error__icon">ðŸ˜•</div>
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
  const currentPhoto = lightboxIndex >= 0 ? photos[lightboxIndex] : null;
  const currentPhotoUrl = currentPhoto?.derivatives?.original || currentPhoto?.derivatives?.watermarked || currentPhoto?.derivatives?.web || currentPhoto?.derivatives?.thumbnail || '';

  return (
    <div className="guest-landing">
      <div className="guest-landing__header">
        <Badge variant="success">Live Event</Badge>
        <h1 className="guest-landing__title">{event.name || event.title}</h1>
        {(event.venue || event.location) && (
          <p className="guest-landing__venue">ðŸ“ {event.venue || event.location}</p>
        )}
        <p className="guest-landing__date">ðŸ“… {formattedDate}</p>
      </div>

      {/* CTA Card */}
      <Card className="guest-landing__cta">
        <Card.Body>
          {qrType === 'B' ? (
            <>
              <h2>ðŸ“¸ Find Your Photos</h2>
              <p style={{color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)'}}>
                Upload a selfie and our AI will find all photos you appear in!
              </p>
              <Link to={`/guest/consent/${token}`} style={{display:'block', width:'100%', textDecoration:'none'}}>
                <Button variant="primary" size="lg" fullWidth>
                  Get My Photos â†’
                </Button>
              </Link>
            </>
          ) : (
            <>
              <h2>ðŸ“· Event Gallery</h2>
              <p style={{color: 'var(--color-text-secondary)'}}>
                {photos.length > 0 
                  ? `Showing ${photos.length} of ${photoCount} event photos â€” click any photo to view full size`
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

      {/* Photo Grid */}
      {qrType === 'A' && photos.length > 0 && (
        <div style={{marginTop: 'var(--space-6)'}}>
          <h3 style={{marginBottom: 'var(--space-4)', fontWeight: 600, fontSize: 'var(--font-size-lg)'}}>
            ðŸ–¼ï¸ Gallery
          </h3>
          <div className="gallery__grid">
            {photos.map((photo, i) => {
              const thumbUrl = photo.derivatives?.thumbnail || photo.derivatives?.web || photo.derivatives?.watermarked || photo.derivatives?.original || '';
              return (
                <div
                  key={photo.id || i}
                  className="gallery__item"
                  onClick={() => openLightbox(i)}
                >
                  {thumbUrl ? (
                    <>
                      <img src={thumbUrl} alt={photo.originalFileName || `Photo ${i + 1}`} loading="lazy" />
                      <div className="gallery__item-overlay">
                        <span style={{color: '#fff', fontSize: '1.5rem'}}>ðŸ”</span>
                      </div>
                    </>
                  ) : (
                    <div style={{
                      width: '100%', height: '100%', 
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)',
                      background: 'var(--color-surface)',
                    }}>
                      Loading...
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

      {/* Processing notice */}
      {qrType === 'A' && photos.length === 0 && photoCount > 0 && !photosLoading && (
        <Card style={{marginTop: 'var(--space-6)', textAlign: 'center'}}>
          <Card.Body>
            <div style={{fontSize: '2rem', marginBottom: 'var(--space-3)'}}>â³</div>
            <h3 style={{marginBottom: 'var(--space-2)'}}>Photos Processing</h3>
            <p style={{color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)'}}>
              {photoCount} photos have been uploaded and are being prepared.
            </p>
            <Button variant="secondary" onClick={() => loadPhotos(1)}>
              ðŸ”„ Refresh Gallery
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

      {/* ======= LIGHTBOX ======= */}
      {lightboxIndex >= 0 && currentPhoto && (
        <div className="lightbox" onClick={closeLightbox}>
          <div className="lightbox__content" onClick={(e) => e.stopPropagation()}>
            {/* Close button */}
            <button className="lightbox__close" onClick={closeLightbox} aria-label="Close">
              <X size={28} />
            </button>

            {/* Navigation arrows */}
            {lightboxIndex > 0 && (
              <button
                onClick={goPrev}
                style={{
                  position: 'absolute', left: '-50px', top: '50%', transform: 'translateY(-50%)',
                  background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%',
                  width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: '#fff', backdropFilter: 'blur(4px)',
                }}
                aria-label="Previous"
              >
                <ChevronLeft size={24} />
              </button>
            )}
            {lightboxIndex < photos.length - 1 && (
              <button
                onClick={goNext}
                style={{
                  position: 'absolute', right: '-50px', top: '50%', transform: 'translateY(-50%)',
                  background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%',
                  width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: '#fff', backdropFilter: 'blur(4px)',
                }}
                aria-label="Next"
              >
                <ChevronRight size={24} />
              </button>
            )}

            {/* Main image */}
            <img src={currentPhotoUrl} alt={currentPhoto.originalFileName || 'Photo'} />

            {/* Actions bar */}
            <div className="lightbox__actions">
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 'var(--space-4)' }}>
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 'var(--font-size-sm)' }}>
                  {lightboxIndex + 1} / {photos.length}
                </span>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleDownload(currentPhoto)}
                  loading={downloading}
                  style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', backdropFilter: 'blur(4px)' }}
                >
                  <Download size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                  Download
                </Button>
              </div>
              {currentPhoto.originalFileName && (
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 'var(--font-size-xs)', marginTop: 'var(--space-2)' }}>
                  {currentPhoto.originalFileName}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}