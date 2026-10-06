/**
 * ConsentPage - Redesigned QR-B flow
 * 
 * NEW FLOW:
 *   1. Scan QR-B -> DPDP/GDPR consent popup (radio button to accept)
 *   2. Accept -> Live camera opens with professional face scanner UI
 *   3. Auto-detects: face position, lighting, distance - shows live suggestions
 *   4. Capture button clicks selfie -> Submit for AI matching
 *
 * NO file upload - camera opens directly via browser getUserMedia API.
 * Camera is NOT fullscreen - professional scanner-style UI with circle overlay.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { Button, Spinner } from '../../components/common';
import './guest.css';

// Face detection status constants
const FACE_STATUS = {
  NO_FACE: 'no_face',
  TOO_FAR: 'too_far',
  TOO_CLOSE: 'too_close',
  OFF_CENTER: 'off_center',
  LOW_LIGHT: 'low_light',
  PERFECT: 'perfect',
};

// Suggestion messages for each status
const FACE_MESSAGES = {
  [FACE_STATUS.NO_FACE]: { text: 'Position your face inside the frame', color: '#f59e0b' },
  [FACE_STATUS.TOO_FAR]: { text: 'Move closer to the camera', color: '#f59e0b' },
  [FACE_STATUS.TOO_CLOSE]: { text: 'Move a bit further from camera', color: '#f59e0b' },
  [FACE_STATUS.OFF_CENTER]: { text: 'Center your face in the frame', color: '#f59e0b' },
  [FACE_STATUS.LOW_LIGHT]: { text: 'Find better lighting', color: '#f59e0b' },
  [FACE_STATUS.PERFECT]: { text: 'Perfect! Hold still and capture', color: '#10b981' },
};

export default function ConsentPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animFrameRef = useRef(null);
  const detectionCanvasRef = useRef(null);

  const [eventInfo, setEventInfo] = useState(null);
  const [eventLoading, setEventLoading] = useState(true);
  const [step, setStep] = useState('consent');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [guestToken, setGuestToken] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [faceStatus, setFaceStatus] = useState(FACE_STATUS.NO_FACE);
  const [brightness, setBrightness] = useState(0);

  // Load event info
  useEffect(() => {
    api.get('/guest/events/' + token)
      .then(({ data }) => {
        if (data.qrType === 'A') {
          navigate('/guest/events/' + token, { replace: true });
          return;
        }
        setEventInfo(data);
      })
      .catch((err) => {
        setError(err.response?.data?.error || 'Invalid QR code.');
      })
      .finally(() => setEventLoading(false));
  }, [token, navigate]);

  // Analyze video frame for face detection hints
  const analyzeFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = detectionCanvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(analyzeFrame);
      return;
    }

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    const w = canvas.width;
    const h = canvas.height;
    const centerX = Math.floor(w * 0.3);
    const centerY = Math.floor(h * 0.15);
    const centerW = Math.floor(w * 0.4);
    const centerH = Math.floor(h * 0.6);

    let imageData;
    try {
      imageData = ctx.getImageData(centerX, centerY, centerW, centerH);
    } catch(e) {
      animFrameRef.current = requestAnimationFrame(analyzeFrame);
      return;
    }

    const data = imageData.data;
    let totalBrightness = 0;
    let skinPixels = 0;

    for (let i = 0; i < data.length; i += 16) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      totalBrightness += lum;
      if (r > 95 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 15 && r - g > 15 && r - b > 15) {
        skinPixels++;
      }
    }

    const sampleCount = Math.floor(data.length / 16);
    const avgBrightness = totalBrightness / sampleCount;
    const skinRatio = skinPixels / sampleCount;
    setBrightness(Math.round(avgBrightness));

    let newStatus;
    if (avgBrightness < 50) {
      newStatus = FACE_STATUS.LOW_LIGHT;
    } else if (skinRatio < 0.05) {
      newStatus = FACE_STATUS.NO_FACE;
    } else if (skinRatio < 0.12) {
      newStatus = FACE_STATUS.TOO_FAR;
    } else if (skinRatio > 0.65) {
      newStatus = FACE_STATUS.TOO_CLOSE;
    } else {
      const leftHalf = { skin: 0, total: 0 };
      const rightHalf = { skin: 0, total: 0 };
      for (let i = 0; i < data.length; i += 16) {
        const pixelIndex = Math.floor(i / 4);
        const col = pixelIndex % centerW;
        const r2 = data[i], g2 = data[i+1], b2 = data[i+2];
        const isSkin = r2 > 95 && g2 > 40 && b2 > 20 && r2 > g2 && r2 > b2 && Math.abs(r2-g2) > 15;
        if (col < centerW / 2) {
          leftHalf.total++;
          if (isSkin) leftHalf.skin++;
        } else {
          rightHalf.total++;
          if (isSkin) rightHalf.skin++;
        }
      }
      const leftRatio = leftHalf.skin / (leftHalf.total || 1);
      const rightRatio = rightHalf.skin / (rightHalf.total || 1);
      const balance = Math.abs(leftRatio - rightRatio) / Math.max(leftRatio, rightRatio, 0.01);
      if (balance > 0.6) {
        newStatus = FACE_STATUS.OFF_CENTER;
      } else {
        newStatus = FACE_STATUS.PERFECT;
      }
    }
    setFaceStatus(newStatus);
    animFrameRef.current = requestAnimationFrame(analyzeFrame);
  }, []);

  // Start camera
  const startCamera = useCallback(async () => {
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
          animFrameRef.current = requestAnimationFrame(analyzeFrame);
        };
      }
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setCameraError('Camera access denied. Please allow camera permission and try again.');
      } else if (err.name === 'NotFoundError') {
        setCameraError('No camera found on this device.');
      } else {
        setCameraError('Unable to access camera: ' + err.message);
      }
    }
  }, [analyzeFrame]);

  const stopCamera = useCallback(() => {
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }
  }, []);

  useEffect(() => { return () => { stopCamera(); }; }, [stopCamera]);

  const handleAcceptConsent = async () => {
    if (!consentAccepted) return;
    setLoading(true);
    setError('');
    try {
      const consentVersion = eventInfo?.consentTextVersion || '1.0';
      const { data } = await api.post('/guest/consent', { qrToken: token, consentTextVersion: consentVersion });
      setGuestToken(data.guestToken);
      setStep('camera');
      setTimeout(() => startCamera(), 100);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to record consent.');
    } finally {
      setLoading(false);
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedImage(imageDataUrl);
    stopCamera();
    setStep('captured');
  };

  const retakePhoto = () => {
    setCapturedImage(null);
    setStep('camera');
    setTimeout(() => startCamera(), 100);
  };

  const handleSubmit = async () => {
    if (!capturedImage || !guestToken) return;
    setLoading(true);
    setError('');
    setStep('submitting');
    try {
      const base64Data = capturedImage.split(',')[1];
      await api.raw.post('/guest/selfie', {
        imageData: base64Data,
        contentType: 'image/jpeg',
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Guest ' + guestToken,
        },
      });
      setStep('done');
      setTimeout(() => { navigate('/guest/gallery/' + guestToken); }, 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Selfie upload failed. Please try again.');
      setStep('captured');
    } finally {
      setLoading(false);
    }
  };

  if (eventLoading) {
    return (
      <div className="page-center" style={{ color: "var(--color-text-secondary)" }}>
        <Spinner size="md" />
        <p style={{ marginTop: "var(--space-3)" }}>Loading event...</p>
      </div>
    );
  }

  if (error && !eventInfo) {
    return (
      <div className="guest-error">
        <div className="guest-error__icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        </div>
        <h2>Invalid QR Code</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="guest-success">
        <div style={{ marginBottom: "var(--space-4)" }}>
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <h2>You're all set!</h2>
        <p>Our AI is finding your photos. Redirecting to your gallery...</p>
        <div className="guest-success__dots"><span></span><span></span><span></span></div>
      </div>
    );
  }

  return (
    <div className="scanner-page">

      {step === 'consent' && (
        <div className="scanner-consent-overlay">
          <div className="scanner-consent-modal">
            <div className="scanner-consent-modal__header">
              <div className="scanner-consent-modal__shield">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <h2>Data Privacy Consent</h2>
              <p className="scanner-consent-modal__event">{eventInfo?.event?.name || 'Event'}</p>
            </div>

            <div className="scanner-consent-modal__body">
              <div className="scanner-consent-modal__section">
                <h4>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{verticalAlign:"middle",marginRight:"6px"}}>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  What we collect
                </h4>
                <ul>
                  <li>A selfie photo for facial recognition</li>
                  <li>Face embedding data (mathematical representation)</li>
                </ul>
              </div>
              <div className="scanner-consent-modal__section">
                <h4>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{verticalAlign:"middle",marginRight:"6px"}}>
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                  How we use it
                </h4>
                <ul>
                  <li>Solely to match you with photos from <b>this event only</b></li>
                  <li>Never shared across events or with third parties</li>
                  <li>You can withdraw consent and delete data anytime</li>
                </ul>
              </div>
              <div className="scanner-consent-modal__compliance">
                <span className="scanner-consent-badge">DPDP Act 2023</span>
                <span className="scanner-consent-badge">GDPR Compliant</span>
              </div>
            </div>

            <div className="scanner-consent-modal__accept">
              <label className="scanner-consent-radio">
                <input type="radio" name="consent" checked={consentAccepted} onChange={() => setConsentAccepted(true)} />
                <span className="scanner-consent-radio__mark"></span>
                <span className="scanner-consent-radio__text">
                  I accept the data privacy terms and consent to facial recognition processing for this event
                </span>
              </label>
            </div>

            {error && <div className="scanner-consent-error">{error}</div>}

            <Button variant="primary" fullWidth size="lg" onClick={handleAcceptConsent} loading={loading} disabled={!consentAccepted} className="scanner-consent-btn">
              Continue to Camera
            </Button>
          </div>
        </div>
      )}

      {step === 'camera' && (
        <div className="scanner-camera">
          <div className="scanner-camera__container">
            {cameraError ? (
              <div className="scanner-camera__error">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/><line x1="4" y1="4" x2="20" y2="20" stroke="#ef4444" strokeWidth="2"/>
                </svg>
                <p>{cameraError}</p>
                <Button variant="secondary" size="sm" onClick={startCamera}>Retry Camera</Button>
              </div>
            ) : (
              <>
                <video ref={videoRef} autoPlay playsInline muted className="scanner-camera__video" />
                <div className="scanner-overlay">
                  <div className={"scanner-frame " + (faceStatus === FACE_STATUS.PERFECT ? "scanner-frame--perfect" : "")}>
                    <div className="scanner-corner scanner-corner--tl"></div>
                    <div className="scanner-corner scanner-corner--tr"></div>
                    <div className="scanner-corner scanner-corner--bl"></div>
                    <div className="scanner-corner scanner-corner--br"></div>
                    {faceStatus !== FACE_STATUS.PERFECT && <div className="scanner-line"></div>}
                  </div>
                </div>
              </>
            )}
          </div>

          <canvas ref={detectionCanvasRef} style={{ display: "none" }} />
          <canvas ref={canvasRef} style={{ display: "none" }} />

          <div className={"scanner-suggestion " + (faceStatus === FACE_STATUS.PERFECT ? "scanner-suggestion--perfect" : "")}>
            <div className="scanner-suggestion__icon">
              {faceStatus === FACE_STATUS.PERFECT ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              ) : faceStatus === FACE_STATUS.LOW_LIGHT ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                  <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><circle cx="9" cy="10" r="1" fill="#f59e0b"/><circle cx="15" cy="10" r="1" fill="#f59e0b"/>
                  <path d="M8 15s1.5 2 4 2 4-2 4-2"/>
                </svg>
              )}
            </div>
            <span style={{ color: FACE_MESSAGES[faceStatus]?.color || "#f59e0b" }}>
              {FACE_MESSAGES[faceStatus]?.text || "Analyzing..."}
            </span>
          </div>

          <div className="scanner-controls">
            <button
              className={"scanner-capture-btn " + (faceStatus === FACE_STATUS.PERFECT ? "scanner-capture-btn--ready" : "")}
              onClick={capturePhoto}
              disabled={cameraError !== ''}
            >
              <div className="scanner-capture-btn__inner">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              </div>
            </button>
            <p className="scanner-controls__hint">
              {faceStatus === FACE_STATUS.PERFECT ? "Tap to capture" : "Adjust your position"}
            </p>
          </div>
        </div>
      )}

      {(step === 'captured' || step === 'submitting') && capturedImage && (
        <div className="scanner-review">
          <h2 className="scanner-review__title">Review Your Selfie</h2>
          <p className="scanner-review__desc">Make sure your face is clearly visible</p>
          <div className="scanner-review__image-wrapper">
            <img src={capturedImage} alt="Captured selfie" className="scanner-review__image" />
          </div>
          {error && <div className="scanner-consent-error" style={{ marginBottom: "16px" }}>{error}</div>}
          <div className="scanner-review__actions">
            <Button variant="secondary" size="lg" onClick={retakePhoto} disabled={step === 'submitting'}>Retake</Button>
            <Button variant="primary" size="lg" onClick={handleSubmit} loading={loading} disabled={step === 'submitting'}>Find My Photos</Button>
          </div>
        </div>
      )}

    </div>
  );
}
