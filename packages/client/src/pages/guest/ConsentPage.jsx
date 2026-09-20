/**
 * Consent Page — QR-B scan → consent + selfie.
 * FR-GUEST-003: Consent form.
 * FR-SELFIE-001: Selfie capture.
 */

import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { Card, Button, Input } from '../../components/common';
import './guest.css';

export default function ConsentPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [step, setStep] = useState('consent'); // consent → selfie → submitting → done
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [selfieFile, setSelfieFile] = useState(null);
  const [selfiePreview, setSelfiePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleConsent = (e) => {
    e.preventDefault();
    setStep('selfie');
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelfieFile(file);
      setSelfiePreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async () => {
    if (!selfieFile) return;
    setLoading(true);
    setError('');
    setStep('submitting');

    try {
      const formData = new FormData();
      formData.append('name', form.name);
      formData.append('email', form.email);
      formData.append('phone', form.phone);
      formData.append('qrToken', token);
      formData.append('consentGiven', 'true');
      formData.append('selfie', selfieFile);

      const { data } = await api.post('/guest/consent', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setStep('done');
      // Navigate to gallery after short delay
      setTimeout(() => {
        if (data.galleryToken) {
          navigate(`/guest/gallery/${data.galleryToken}`);
        }
      }, 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Submission failed.');
      setStep('selfie');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'done') {
    return (
      <div className="guest-success">
        <div className="guest-success__icon">🎉</div>
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
            <h2 className="guest-consent__title">👋 Welcome!</h2>
            <p className="guest-consent__desc">
              Enter your details and upload a selfie. Our AI will find all event photos you appear in.
            </p>

            <div className="guest-consent__privacy">
              🔒 Your selfie is processed securely and never shared. You can request deletion anytime.
            </div>

            <form onSubmit={handleConsent} className="guest-consent__form">
              {error && <div className="auth-card__error">{error}</div>}

              <Input id="name" label="Your Name" placeholder="John Doe" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <Input id="email" label="Email (optional)" type="email" placeholder="john@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <Input id="phone" label="Phone (optional)" type="tel" placeholder="+91 98765 43210" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />

              <label className="guest-consent__checkbox">
                <input type="checkbox" required />
                <span>I consent to facial recognition processing for this event only</span>
              </label>

              <Button type="submit" variant="primary" fullWidth size="lg">Continue →</Button>
            </form>
          </Card.Body>
        </Card>
      )}

      {(step === 'selfie' || step === 'submitting') && (
        <Card>
          <Card.Body>
            <h2 className="guest-consent__title">📸 Take a Selfie</h2>
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
                <div className="selfie-upload__icon">🤳</div>
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
