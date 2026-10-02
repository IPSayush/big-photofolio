/**
 * Event Detail Page - single event with QR codes, stats, and management.
 * FR-EVENT-006: Dashboard stats.
 * FR-EVENT-007: Delete event with confirmation.
 */

import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { Card, StatCard, Badge, Button, Spinner } from '../../components/common';
import { Camera, CheckCircle, XCircle, Users, Link2, HardDrive, Upload, AlertCircle } from '../../components/Icons';
import '../dashboard/dashboard.css';
import './events.css';

function iconEl(IconComp) {
  return <IconComp size={22} />;
}

export default function EventDetailPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);

  // Delete confirmation state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    api.get(`/events/${eventId}`)
      .then(({ data }) => setEvent(data.event))
      .catch(() => navigate('/events'))
      .finally(() => setLoading(false));
  }, [eventId]);

  const handleDelete = async () => {
    if (deleteConfirmName !== event.name) return;
    setDeleting(true);
    setDeleteError('');

    try {
      await api.delete(`/events/${eventId}`);
      navigate('/events');
    } catch (err) {
      setDeleteError(err.response?.data?.error || 'Delete failed.');
      setDeleting(false);
    }
  };

  if (loading) return <div className="page-center"><Spinner size="lg" /></div>;
  if (!event) return null;

  const stats = event.stats || {};
  const isDeleting = event.status === 'deleting';

  const startDate = event.date?.start ? new Date(event.date.start).toLocaleString('en-IN') : 'Not set';
  const endDate = event.date?.end ? new Date(event.date.end).toLocaleString('en-IN') : 'Same as start';

  return (
    <div className="event-detail">
      <div className="page-header">
        <div>
          <Link to="/events" className="event-detail__back">← Back to Events</Link>
          <h1 className="page-title">{event.name}</h1>
        </div>
        <Badge variant={event.status === 'active' ? 'success' : event.status === 'deleting' ? 'error' : 'default'} className="event-detail__badge">
          {isDeleting ? 'Deleting...' : event.status}
        </Badge>
      </div>

      {isDeleting && (
        <div className="auth-card__error" style={{ marginBottom: 'var(--space-4)', textAlign: 'center', padding: 'var(--space-4)' }}>
          This event is being permanently deleted. All data will be removed shortly.
        </div>
      )}

      {/* Event Info */}
      <div className="event-detail__info">
        <Card>
          <Card.Body>
            <div className="event-info-grid">
              <div><span className="event-info__label">Venue</span><span>{event.venue}</span></div>
              <div><span className="event-info__label">Start</span><span>{startDate}</span></div>
              <div><span className="event-info__label">End</span><span>{endDate}</span></div>
              <div><span className="event-info__label">Access</span><span>{event.accessMode}</span></div>
            </div>
          </Card.Body>
        </Card>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginTop: 'var(--space-6)' }}>
        <StatCard icon={iconEl(Camera)} label="Photos" value={stats.photoCount || 0} />
        <StatCard icon={iconEl(CheckCircle)} label="Processed" value={stats.processedPhotoCount || 0} />
        <StatCard icon={iconEl(XCircle)} label="Failed" value={stats.failedPhotoCount || 0} />
        <StatCard icon={iconEl(Users)} label="Guests" value={stats.guestCount || 0} />
        <StatCard icon={iconEl(Link2)} label="Matches" value={stats.matchCount || 0} />
        <StatCard icon={iconEl(HardDrive)} label="Storage" value={formatBytes(stats.storageUsedBytes || 0)} />
      </div>

      {/* QR Codes */}
      {!isDeleting && (
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
      )}

      {/* Actions */}
      {!isDeleting && (
        <div className="event-detail__actions" style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center', flexWrap: 'wrap' }}>
          <Link to={`/events/${eventId}/upload`}>
            <Button variant="primary" size="lg">
              <Upload size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} /> Upload Photos
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="lg"
            onClick={() => setShowDeleteModal(true)}
            style={{ color: 'var(--color-error)', borderColor: 'var(--color-error)' }}
          >
            Delete Event
          </Button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => !deleting && setShowDeleteModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title" style={{ color: 'var(--color-error)' }}>
              Permanently Delete Event
            </h2>
            <p className="modal-desc">
              This action is <strong>irreversible</strong>. The following will be permanently deleted:
            </p>
            <ul className="modal-list">
              <li>All {stats.photoCount || 0} photos (originals + derivatives)</li>
              <li>All {stats.guestCount || 0} guest records and consent data</li>
              <li>All face detection data and matches</li>
              <li>All files from cloud storage (S3)</li>
            </ul>
            <p className="modal-desc" style={{ marginTop: 'var(--space-4)' }}>
              To confirm, type the event name: <strong>{event.name}</strong>
            </p>
            <input
              type="text"
              className="modal-confirm-input"
              placeholder="Type event name to confirm"
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              disabled={deleting}
              autoFocus
            />
            {deleteError && <div className="auth-card__error" style={{ marginTop: 'var(--space-3)' }}>{deleteError}</div>}
            <div className="modal-actions">
              <Button variant="ghost" onClick={() => setShowDeleteModal(false)} disabled={deleting}>Cancel</Button>
              <Button
                variant="primary"
                onClick={handleDelete}
                loading={deleting}
                disabled={deleteConfirmName !== event.name || deleting}
                style={{ backgroundColor: 'var(--color-error)', borderColor: 'var(--color-error)' }}
              >
                Delete Forever
              </Button>
            </div>
          </div>
        </div>
      )}
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
