/**
 * Gallery Page — Personalized Guest Gallery (QR-B flow).
 * FR-GALLERY-001/002/003/004: View matched photos, download, signed URLs, processing state.
 * FR-GUEST-005: Self-service consent withdrawal.
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../api/client';
import { Card, Spinner, Button, EmptyState } from '../../components/common';
import {
  Camera,
  Download,
  X as XIcon,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  RefreshCw,
  ShieldAlert,
} from '../../components/Icons';
import './guest.css';

export default function GalleryPage() {
  const { galleryToken } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [downloadingId, setDownloadingId] = useState(null);
  const [withdrawModal, setWithdrawModal] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawn, setWithdrawn] = useState(false);

  const fetchGallery = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      // Pass token in path and also Authorization header for maximum compatibility
      const res = await api.get(`/guest/gallery/${galleryToken}`, {
        headers: {
          Authorization: `Guest ${galleryToken}`,
        },
      });
      setData(res.data);
    } catch (err) {
      setError(
        err.response?.data?.error || 'Unable to load your personalized gallery. The link may be expired.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [galleryToken]);

  useEffect(() => {
    fetchGallery();
  }, [fetchGallery]);

  const photos = data?.photos || [];
  const selectedPhoto = selectedIndex >= 0 ? photos[selectedIndex] : null;

  // Lightbox navigation
  const goNext = useCallback(() => {
    if (selectedIndex < photos.length - 1) setSelectedIndex(selectedIndex + 1);
  }, [selectedIndex, photos.length]);

  const goPrev = useCallback(() => {
    if (selectedIndex > 0) setSelectedIndex(selectedIndex - 1);
  }, [selectedIndex]);

  useEffect(() => {
    if (selectedIndex < 0) return;
    const handler = (e) => {
      if (e.key === 'Escape') setSelectedIndex(-1);
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedIndex, goNext, goPrev]);

  // Download photo using proxy or derivative link
  const handleDownload = async (photo) => {
    if (!photo) return;
    setDownloadingId(photo.id);
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
      const fallbackUrl =
        photo.derivatives?.original ||
        photo.derivatives?.web ||
        photo.derivatives?.watermarked ||
        '';
      if (fallbackUrl) window.open(fallbackUrl, '_blank');
    } finally {
      setTimeout(() => setDownloadingId(null), 1000);
    }
  };

  // Withdraw consent (FR-GUEST-005)
  const handleWithdrawConsent = async () => {
    setWithdrawing(true);
    try {
      await api.post(
        '/guest/consent/withdraw',
        {},
        {
          headers: {
            Authorization: `Guest ${galleryToken}`,
          },
        }
      );
      setWithdrawn(true);
      setWithdrawModal(false);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to withdraw consent.');
    } finally {
      setWithdrawing(false);
    }
  };

  if (loading) {
    return (
      <div className="page-center" style={{ minHeight: '60vh', textAlign: 'center' }}>
        <Spinner size="lg" />
        <p style={{ marginTop: 'var(--space-4)', color: 'var(--color-text-secondary)' }}>
          Finding your photos using AI...
        </p>
      </div>
    );
  }

  if (withdrawn) {
    return (
      <div className="container" style={{ maxWidth: 600, margin: '80px auto', textAlign: 'center' }}>
        <Card style={{ padding: 'var(--space-8)' }}>
          <div style={{ color: 'var(--color-success)', marginBottom: 'var(--space-4)' }}>
            <Sparkles size={48} />
          </div>
          <h2>Biometric Data Deleted</h2>
          <p style={{ color: 'var(--color-text-secondary)', margin: 'var(--space-4) 0' }}>
            Your selfie and facial recognition data have been permanently removed in accordance with DPDP and GDPR compliance.
          </p>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container" style={{ maxWidth: 600, margin: '60px auto', textAlign: 'center' }}>
        <EmptyState
          icon={<Camera size={48} />}
          title="Could Not Load Gallery"
          description={error}
          action={
            <Button variant="primary" onClick={() => fetchGallery()}>
              Try Again
            </Button>
          }
        />
      </div>
    );
  }

  const isProcessing = data?.processingStatus && !data.processingStatus.complete;

  return (
    <div className="gallery" style={{ maxWidth: 1200, margin: '0 auto', padding: 'var(--space-6) var(--space-4)' }}>
      {/* Gallery Header */}
      <div
        className="gallery__header"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-6)',
          borderBottom: '1px solid var(--color-border)',
          paddingBottom: 'var(--space-4)',
        }}
      >
        <div>
          <h1 className="gallery__title" style={{ fontSize: 'var(--font-size-2xl)', margin: 0 }}>
            Your Matched Photos
          </h1>
          <p className="gallery__count" style={{ color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
            {photos.length} {photos.length === 1 ? 'photo' : 'photos'} matched to your face
          </p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchGallery(true)}
            disabled={refreshing}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
            {refreshing ? 'Checking...' : 'Refresh'}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setWithdrawModal(true)}
            style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}
          >
            Privacy Settings
          </Button>
        </div>
      </div>

      {/* Processing Notice */}
      {isProcessing && (
        <div
          style={{
            padding: 'var(--space-3) var(--space-4)',
            marginBottom: 'var(--space-5)',
            background: 'rgba(201, 169, 110, 0.12)',
            border: '1px solid var(--color-primary)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={20} color="var(--color-primary)" />
            <span style={{ fontSize: '0.9rem', color: 'var(--color-text)' }}>
              AI is currently indexing newer event photos ({data.processingStatus.processedPhotos} / {data.processingStatus.totalPhotos}). More photos may appear soon.
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => fetchGallery(true)}>
            Refresh
          </Button>
        </div>
      )}

      {/* Empty State */}
      {photos.length === 0 ? (
        <div style={{ padding: 'var(--space-12) 0' }}>
          <EmptyState
            icon={<Camera size={56} />}
            title="No matching photos found yet"
            description={
              isProcessing
                ? "The photographer's photos are still being indexed by our AI. Check back shortly!"
                : "We couldn't find photos matching your selfie in this event. Photos uploaded later will be automatically matched."
            }
            action={
              <Button variant="primary" onClick={() => fetchGallery(true)} disabled={refreshing}>
                <RefreshCw size={16} style={{ marginRight: 6 }} />
                {refreshing ? 'Checking...' : 'Check Again'}
              </Button>
            }
          />
        </div>
      ) : (
        /* Photo Grid */
        <div className="gallery__grid">
          {photos.map((photo, idx) => {
            const thumbUrl =
              photo.derivatives?.thumbnail ||
              photo.derivatives?.web ||
              photo.derivatives?.original;
            const confidencePct = photo.confidenceScore
              ? Math.round(photo.confidenceScore * 100)
              : null;

            return (
              <div
                key={photo.id || idx}
                className="gallery__item"
                onClick={() => setSelectedIndex(idx)}
                style={{ position: 'relative' }}
              >
                <img
                  src={thumbUrl}
                  alt={photo.originalFileName || `Matched photo ${idx + 1}`}
                  loading="lazy"
                />

                {/* Match confidence badge */}
                {confidencePct && (
                  <span
                    style={{
                      position: 'absolute',
                      top: 8,
                      left: 8,
                      background: 'rgba(0,0,0,0.65)',
                      color: '#fff',
                      fontSize: '0.75rem',
                      padding: '2px 8px',
                      borderRadius: 12,
                      backdropFilter: 'blur(4px)',
                      fontWeight: 500,
                    }}
                  >
                    {confidencePct}% match
                  </span>
                )}

                <div className="gallery__item-overlay">
                  <Camera size={24} />
                </div>

                {/* Quick download button */}
                <button
                  type="button"
                  className="gallery__item-download"
                  title="Download photo"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownload(photo);
                  }}
                >
                  <Download size={18} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox Modal */}
      {selectedPhoto && (
        <div className="lightbox" onClick={() => setSelectedIndex(-1)}>
          <div className="lightbox__content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="lightbox__close"
              onClick={() => setSelectedIndex(-1)}
              aria-label="Close"
            >
              <XIcon size={24} />
            </button>

            {/* Prev button */}
            {selectedIndex > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  goPrev();
                }}
                style={{
                  position: 'absolute',
                  left: -50,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'rgba(0,0,0,0.5)',
                  border: 'none',
                  color: '#fff',
                  borderRadius: '50%',
                  width: 44,
                  height: 44,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                aria-label="Previous photo"
              >
                <ChevronLeft size={28} />
              </button>
            )}

            {/* Next button */}
            {selectedIndex < photos.length - 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  goNext();
                }}
                style={{
                  position: 'absolute',
                  right: -50,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'rgba(0,0,0,0.5)',
                  border: 'none',
                  color: '#fff',
                  borderRadius: '50%',
                  width: 44,
                  height: 44,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                aria-label="Next photo"
              >
                <ChevronRight size={28} />
              </button>
            )}

            <img
              src={
                selectedPhoto.derivatives?.web ||
                selectedPhoto.derivatives?.original ||
                selectedPhoto.derivatives?.thumbnail
              }
              alt={selectedPhoto.originalFileName || 'Full preview'}
            />

            <div className="lightbox__actions" style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
              <Button
                variant="primary"
                size="lg"
                disabled={downloadingId === selectedPhoto.id}
                onClick={() => handleDownload(selectedPhoto)}
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <Download size={20} />
                {downloadingId === selectedPhoto.id ? 'Downloading...' : 'Download Full Resolution'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Withdraw Consent Modal */}
      {withdrawModal && (
        <div className="lightbox" onClick={() => setWithdrawModal(false)}>
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 480,
              width: '90%',
              padding: 'var(--space-6)',
              background: 'var(--color-bg-card)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--color-danger)' }}>
              <ShieldAlert size={28} />
              <h3 style={{ margin: 0 }}>Delete Biometric Data?</h3>
            </div>

            <p style={{ color: 'var(--color-text-secondary)', margin: 'var(--space-4) 0' }}>
              Under DPDP Act 2023 and GDPR, you have the right to withdraw consent at any time. This will permanently delete your selfie and facial recognition embedding from this event.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button variant="ghost" onClick={() => setWithdrawModal(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={withdrawing}
                onClick={handleWithdrawConsent}
              >
                {withdrawing ? 'Deleting...' : 'Delete My Biometric Data'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
