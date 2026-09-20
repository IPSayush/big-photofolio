/**
 * Gallery Page — personalized photo gallery.
 * FR-GALLERY-001/002: View matched photos + download.
 */

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../api/client';
import { Card, Spinner, Button, EmptyState } from '../../components/common';
import './guest.css';

export default function GalleryPage() {
  const { galleryToken } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  useEffect(() => {
    api.get(`/guest/gallery/${galleryToken}`)
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [galleryToken]);

  if (loading) return <div className="page-center"><Spinner size="lg" /></div>;

  if (!data || !data.photos || data.photos.length === 0) {
    return (
      <EmptyState
        icon="🔍"
        title="No photos found yet"
        description="Our AI is still processing. Check back in a few minutes!"
      />
    );
  }

  return (
    <div className="gallery">
      <div className="gallery__header">
        <h1 className="gallery__title">Your Photos</h1>
        <p className="gallery__count">{data.photos.length} photos found</p>
      </div>

      <div className="gallery__grid">
        {data.photos.map((photo, idx) => (
          <div key={idx} className="gallery__item" onClick={() => setSelectedPhoto(photo)}>
            <img src={photo.thumbnailUrl || photo.url} alt={`Photo ${idx + 1}`} loading="lazy" />
            <div className="gallery__item-overlay">
              <span>🔍</span>
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {selectedPhoto && (
        <div className="lightbox" onClick={() => setSelectedPhoto(null)}>
          <div className="lightbox__content" onClick={(e) => e.stopPropagation()}>
            <button className="lightbox__close" onClick={() => setSelectedPhoto(null)}>✕</button>
            <img src={selectedPhoto.url} alt="Full size" />
            <div className="lightbox__actions">
              <a href={selectedPhoto.downloadUrl || selectedPhoto.url} download>
                <Button variant="primary" size="lg">⬇️ Download</Button>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
