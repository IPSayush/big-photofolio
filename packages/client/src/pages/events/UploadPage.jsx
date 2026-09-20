/**
 * Upload Page — drag & drop multi-file upload.
 * FR-UPLOAD-002: Pre-signed S3 URLs + parallel upload.
 */

import { useState, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../api/client';
import { Button, Badge } from '../../components/common';
import '../dashboard/dashboard.css';
import './events.css';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

export default function UploadPage() {
  const { eventId } = useParams();
  const fileInputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState('');

  const addFiles = useCallback((newFiles) => {
    const valid = Array.from(newFiles)
      .filter((f) => ALLOWED_TYPES.includes(f.type))
      .map((f) => ({
        file: f,
        name: f.name,
        size: f.size,
        status: 'pending',
        progress: 0,
      }));
    setFiles((prev) => [...prev, ...valid]);
  }, []);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    addFiles(e.dataTransfer.files);
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setError('');

    try {
      // 1. Request pre-signed URLs
      const filesMeta = files.map((f) => ({
        fileName: f.name,
        contentType: f.file.type,
        sizeBytes: f.size,
      }));

      const { data } = await api.post(`/events/${eventId}/photos/upload-url`, { files: filesMeta });

      // 2. Upload each file to S3
      const photoIds = [];
      for (let i = 0; i < data.uploads.length; i++) {
        const { uploadUrl, photoId } = data.uploads[i];
        photoIds.push(photoId);

        setFiles((prev) => prev.map((f, idx) =>
          idx === i ? { ...f, status: 'uploading', progress: 0 } : f
        ));

        try {
          await fetch(uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': files[i].file.type },
            body: files[i].file,
          });

          setFiles((prev) => prev.map((f, idx) =>
            idx === i ? { ...f, status: 'done', progress: 100 } : f
          ));
        } catch {
          setFiles((prev) => prev.map((f, idx) =>
            idx === i ? { ...f, status: 'failed' } : f
          ));
        }
      }

      // 3. Confirm upload
      const successIds = photoIds.filter((_, i) => files[i]?.status !== 'failed');
      if (successIds.length > 0) {
        await api.post(`/events/${eventId}/photos/confirm`, { photoIds: successIds });
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const completed = files.filter((f) => f.status === 'done').length;
  const failed = files.filter((f) => f.status === 'failed').length;

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to={`/events/${eventId}`} className="event-detail__back">← Back to Event</Link>
          <h1 className="page-title">Upload Photos</h1>
        </div>
      </div>

      {error && <div className="auth-card__error" style={{ marginBottom: 'var(--space-4)' }}>{error}</div>}

      {/* Drop Zone */}
      <div
        className={`upload-zone ${dragActive ? 'upload-zone--active' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="upload-zone__icon">📤</div>
        <div className="upload-zone__title">Drag & drop photos here</div>
        <div className="upload-zone__desc">or click to browse. JPEG, PNG, WebP, HEIC supported.</div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ALLOWED_TYPES.join(',')}
          style={{ display: 'none' }}
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {/* File List */}
      {files.length > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: 'var(--space-6) 0 var(--space-3)' }}>
            <p style={{ color: 'var(--color-text-secondary)' }}>
              {files.length} file{files.length !== 1 && 's'} selected
              {completed > 0 && <> · <span style={{ color: 'var(--color-success)' }}>{completed} uploaded</span></>}
              {failed > 0 && <> · <span style={{ color: 'var(--color-error)' }}>{failed} failed</span></>}
            </p>
            <Button variant="primary" onClick={handleUpload} loading={uploading} disabled={uploading || completed === files.length}>
              {completed === files.length ? '✓ Done' : `Upload ${files.length} Files`}
            </Button>
          </div>

          <div className="upload-files">
            {files.map((f, i) => (
              <div key={i} className="upload-file">
                <span className="upload-file__name">{f.name}</span>
                <span className="upload-file__size">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                <Badge variant={f.status === 'done' ? 'success' : f.status === 'failed' ? 'error' : f.status === 'uploading' ? 'info' : 'default'}>
                  {f.status}
                </Badge>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
