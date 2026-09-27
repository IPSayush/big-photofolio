/**
 * Consent Page â€” QR-B scan â†’ consent + selfie.
 * FR-GUEST-003: Consent form with versioned text.
 * FR-SELFIE-001: Selfie capture and submission.
 *
 * Two-step flow matching backend API:
 *   Step 1: POST /api/guest/consent  (JSON: { qrToken, consentTextVersion })
 *           â†’ returns { guestToken, guestId, eventId }
 *   Step 2: POST /guest/selfie (via api.raw, baseURL already has /api)   (JSON: { imageData (base64), contentType })
 *           with Authorization: Guest <guestToken>
 */

import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { Card, Button, Input } from '../../components/common';
import './guest.css';

export default function ConsentPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // Event info loaded via QR token
  const [eventInfo, setEventInfo] = useState(null);
  const [eventLoading, setEventLoading] = useState(true);

  const [step, setStep] = useState('consent'); // consent â†’ selfie â†’ submitting â†’ done
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [selfieFile, setSelfieFile] = useState(null);
  const [selfiePreview, setSelfiePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Guest auth token received after consent â€” needed for selfie upload
  const [guestToken, setGuestToken] = useState(null);

  // Load event info on mount to get consent text version
  useEffect(() => {
    api.get(`/guest/events/${token}`)
      .then(({ data }) => {
        setEventInfo(data);
      })
      .catch((err) => {
        setError(err.response?.data?.error || 'Invalid QR code.');
      })
      .finally(() => setEventLoading(false));
  }, [token]);

  const handleConsent = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Step 1: Record consent â€” FR-GUEST-003
      // Backend expects JSON: { qrToken, consentTextVersion }
      const consentVersion = eventInfo?.consentTextVersion || '1.0';

      const { data } = await api.post('/guest/consent', {
        qrToken: token,
        consentTextVersion: consentVersion,
      });

      // Save guest token for selfie upload auth
      setGuestToken(data.guestToken);
      setStep('selfie');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to record consent.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelfieFile(file);
      setSelfiePreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async () => {
    if (!selfieFile || !guestToken) return;
    setLoading(true);
    setError('');
    setStep('submitting');

    try {
      // Convert file to base64 for the JSON API â€” backend expects { imageData, contentType }
      const arrayBuffer = await selfieFile.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      // Step 2: Upload selfie â€” FR-SELFIE-001
      // Uses guest auth: Authorization: Guest <guestToken>
      const { data } = await api.raw.post('/guest/selfie', {
        imageData: base64,
        contentType: selfieFile.type || 'image/jpeg',
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Guest ${guestToken}`,
        },
      });

      setStep('done');
      // Navigate to gallery after short delay
      setTimeout(() => {
        navigate(`/guest/gallery/${guestToken}`);
      }, 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Selfie upload failed.');
      setStep('selfie');
    } finally {
      setLoading(false);
    }
  };

  if (eventLoading) {
    return <div className="page-center" style={{ color: 'var(--color-text-secondary)' }}>Loading...</div>;
  }

  if (step === 'done') {
    return (
      <div className="guest-success">
        <div className="guest-success__icon">ðŸŽ‰</div>
        <h2>You're all set!</h2>
        <p>Our AI is finding your photos. You'll be redirected to your gallery shortly.</p>
        <div className="guest-success__loading">
          <div className="guest-success__dots">
            <span></span><span></span><span></span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="guest-consent">
      {step === 'consent' && (
        <Card>
          <Card.Body>
            <h2 className="guest-consent__title">ðŸ‘‹ Welcome!</h2>
            <p className="guest-consent__desc">
              Enter your details and consent to facial recognition. Our AI will find all event photos you appear in.
            </p>

            {eventInfo?.consentText && (
              <div className="guest-consent__privacy">
                ðŸ”’ {eventInfo.consentText}
              </div>
            )}
            {!eventInfo?.consentText && (
              <div className="guest-consent__privacy">
                ðŸ”’ Your selfie is processed securely and never shared. You can request deletion anytime.
              </div>
            )}

            <form onSubmit={handleConsent} className="guest-consent__form">
              {error && <div className="auth-card__error">{error}</div>}

              <Input id="name" label="Your Name" placeholder="John Doe" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <Input id="email" label="Email (optional)" type="email" placeholder="john@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <Input id="phone" label="Phone (optional)" type="tel" placeholder="+91 98765 43210" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />

              <label className="guest-consent__checkbox">
                <input type="checkbox" required />
                <span>I consent to facial recognition processing for this event only</span>
              </label>

              <Button type="submit" variant="primary" fullWidth size="lg" loading={loading}>Continue â†’</Button>
            </form>
          </Card.Body>
        </Card>
      )}

      {(step === 'selfie' || step === 'submitting') && (
        <Card>
          <Card.Body>
            <h2 className="guest-consent__title">ðŸ“¸ Take a Selfie</h2>
            <p className="guest-consent__desc">Upload a clear photo of your face. This helps our AI find you in event photos.</p>

            {selfiePreview ? (
              <div className="selfie-preview">
                <img src={selfiePreview} alt="Selfie preview" />
                <Button variant="ghost" size="sm" onClick={() => { setSelfieFile(null); setSelfiePreview(null); }}>
                  Change Photo
                </Button>
              </div>
            ) : (
              <div className="selfie-upload" onClick={() => fileInputRef.current?.click()}>
                <div className="selfie-upload__icon">ðŸ¤³</div>
                <p>Tap to upload your selfie</p>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="user"
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />

            {error && <div className="auth-card__error" style={{ marginTop: 'var(--space-4)' }}>{error}</div>}

            <Button
              variant="primary"
              fullWidth
              size="lg"
              onClick={handleSubmit}
              loading={loading}
              disabled={!selfieFile}
              style={{ marginTop: 'var(--space-4)' }}
            >
              Submit & Find My Photos
            </Button>
          </Card.Body>
        </Card>
      )}
    </div>
  );
}