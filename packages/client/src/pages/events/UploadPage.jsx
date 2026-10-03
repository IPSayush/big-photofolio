/**
 * Upload Page — drag & drop multi-file upload.
 * FR-UPLOAD-002: Pre-signed S3 URLs + parallel upload.
 * FR-UPLOAD-005: SHA-256 hash for duplicate detection.
 */

import { useState, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../api/client';
import { Button, Badge } from '../../components/common';
import '../dashboard/dashboard.css';
import './events.css';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

/**
 * Compute SHA-256 hash of a File object using Web Crypto API.
 * FR-UPLOAD-005: Required for server-side duplicate detection.
 * @param {File} file
 * @returns {Promise<string>} 64-char lowercase hex SHA-256 hash
 */
async function computeSHA256(file) {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

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
      // 1. Compute SHA-256 hashes for duplicate detection (FR-UPLOAD-005)
      setFiles((prev) => prev.map((f) => ({ ...f, status: 'hashing' })));

      const filesMeta = await Promise.all(
        files.map(async (f) => ({
          fileName: f.name,
          contentType: f.file.type,
          sizeBytes: f.size,
          hash: await computeSHA256(f.file),
        }))
      );

      setFiles((prev) => prev.map((f) => ({ ...f, status: 'pending' })));

      // 2. Request pre-signed URLs
      const { data } = await api.post(`/events/${eventId}/photos/upload-url`, { files: filesMeta });

      // 3. Upload each file to S3 (skip duplicates)
      const photoIds = [];
      for (let i = 0; i < data.files.length; i++) {
        const { uploadUrl, photoId, isDuplicate } = data.files[i];

        // FR-UPLOAD-005: Skip duplicates — server flagged them
        if (isDuplicate) {
          setFiles((prev) => prev.map((f, idx) =>
            idx === i ? { ...f, status: 'duplicate' } : f
          ));
          continue;
        }

        photoIds.push(photoId);

        setFiles((prev) => prev.map((f, idx) =>
          idx === i ? { ...f, status: 'uploading', progress: 0 } : f
        ));

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 120000); // 2min per file
          await fetch(uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': files[i].file.type },
            body: files[i].file,
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          setFiles((prev) => prev.map((f, idx) =>
            idx === i ? { ...f, status: 'done', progress: 100 } : f
          ));
        } catch {
          setFiles((prev) => prev.map((f, idx) =>
            idx === i ? { ...f, status: 'failed' } : f
          ));
        }
      }

      // 4. Confirm upload for successfully uploaded photos
      if (photoIds.length > 0) {
        try {
          await api.post(`/events/${eventId}/photos/confirm`, { photoIds });
        } catch (confirmErr) {
          console.warn('Confirm step failed but photos were uploaded:', confirmErr);
          // Photos are already in S3, confirm can be retried
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed. Some photos may have been uploaded successfully.');
    } finally {
      setUploading(false);
    }
  };

  const completed = files.filter((f) => f.status === 'done').length;
  const failed = files.filter((f) => f.status === 'failed').length;
  const duplicates = files.filter((f) => f.status === 'duplicate').length;

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
        <div className="upload-zone__icon"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div>
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
              {duplicates > 0 && <> · <span style={{ color: 'var(--color-warning, #f59e0b)' }}>{duplicates} duplicate{duplicates !== 1 && 's'}</span></>}
              {failed > 0 && <> · <span style={{ color: 'var(--color-error)' }}>{failed} failed</span></>}
            </p>
            <Button variant="primary" onClick={handleUpload} loading={uploading} disabled={uploading || completed === files.length}>
              {uploading ? 'Uploading...' : completed === files.length ? '✅ Done' : `Upload ${files.length} Files`}
            </Button>
          </div>

          <div className="upload-files">
            {files.map((f, i) => (
              <div key={i} className="upload-file">
                <span className="upload-file__name">{f.name}</span>
                <span className="upload-file__size">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                <Badge variant={
                  f.status === 'done' ? 'success' :
                  f.status === 'failed' ? 'error' :
                  f.status === 'uploading' || f.status === 'hashing' ? 'info' :
                  f.status === 'duplicate' ? 'warning' :
                  'default'
                }>
                  {f.status === 'hashing' ? 'computing hash...' : f.status}
                </Badge>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}