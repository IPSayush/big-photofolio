/**
 * Guest Routes — guest-facing API endpoints.
 * SEC-008: Rate limiting applied to all guest endpoints.
 * DEC-003: Lightweight guest auth via session token.
 */

const express = require('express');
const router = express.Router();
const guestController = require('../controllers/guest.controller');
const { guestAuth } = require('../middleware/guestAuth');
const { guestLimiter } = require('../middleware/rateLimiter');
const { checkGuestQuota } = require('../middleware/quotaCheck');

// Apply guest rate limiter to all routes — SEC-008
router.use(guestLimiter);

// --- Public routes (no auth) ---

// GET /api/guest/events/:qrToken — event info via QR scan (FR-GUEST-001/002)
router.get('/events/:qrToken', guestController.getEventByQr);

// GET /api/guest/events/:qrToken/gallery — browsable gallery via QR-A (PRIV-006)
router.get('/events/:qrToken/gallery', guestController.getBrowsableGallery);

// POST /api/guest/consent — record consent, get guest token (FR-GUEST-003)
// FR-PLAN-003: Guest quota check
router.post('/consent', checkGuestQuota, guestController.recordConsent);

// --- Authenticated guest routes ---

// POST /api/guest/selfie — upload selfie (FR-SELFIE-001)
router.post('/selfie', guestAuth, guestController.uploadSelfie);

// GET /api/guest/gallery — personalized gallery (FR-GALLERY-001)
router.get('/gallery', guestAuth, guestController.getPersonalizedGallery);

// POST /api/guest/consent/withdraw — withdraw consent (FR-GUEST-005)
router.post('/consent/withdraw', guestAuth, guestController.withdrawConsent);

module.exports = router;
