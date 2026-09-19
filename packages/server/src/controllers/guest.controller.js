/**
 * Guest Controller — handles HTTP requests for guest-facing endpoints.
 * Delegates business logic to guest.service.js.
 */

const guestService = require('../services/guest.service');
const { AppError } = require('../middleware/errorHandler');

/**
 * GET /api/guest/events/:qrToken
 * Look up event by QR token — FR-GUEST-001/002.
 */
async function getEventByQr(req, res, next) {
  try {
    const { qrToken } = req.params;
    const result = await guestService.getEventByQrToken(qrToken);

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/guest/events/:qrToken/gallery
 * Browsable gallery via QR-A — FR-GUEST-001, PRIV-006.
 */
async function getBrowsableGallery(req, res, next) {
  try {
    const { qrToken } = req.params;

    // Look up event and verify it's QR-A access
    const eventInfo = await guestService.getEventByQrToken(qrToken);

    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

    const result = await guestService.getBrowsableGallery(eventInfo.event.id, { page, limit });

    res.json({
      success: true,
      data: {
        event: eventInfo.event,
        ...result,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/guest/consent
 * Record consent and create guest session — FR-GUEST-003.
 */
async function recordConsent(req, res, next) {
  try {
    const { qrToken, consentTextVersion } = req.body;

    if (!qrToken) {
      throw new AppError('QR token is required.', 400, 'MISSING_QR_TOKEN');
    }
    if (!consentTextVersion) {
      throw new AppError('Consent text version is required.', 400, 'MISSING_CONSENT_VERSION');
    }

    const result = await guestService.recordConsent(qrToken, consentTextVersion);

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/guest/selfie
 * Upload and validate selfie — FR-SELFIE-001 through 005.
 * Requires guest auth.
 */
async function uploadSelfie(req, res, next) {
  try {
    // For MVP, accept selfie as base64 in body (small image)
    const { imageData, contentType } = req.body;

    if (!imageData) {
      throw new AppError('Image data is required.', 400, 'MISSING_IMAGE_DATA');
    }

    const imageBuffer = Buffer.from(imageData, 'base64');

    if (imageBuffer.length === 0) {
      throw new AppError('Image data is empty.', 400, 'EMPTY_IMAGE');
    }

    // Max 10MB for selfie
    if (imageBuffer.length > 10 * 1024 * 1024) {
      throw new AppError('Selfie too large. Maximum 10MB.', 400, 'SELFIE_TOO_LARGE');
    }

    const result = await guestService.processSelfie(
      req.guestId,
      imageBuffer,
      contentType || 'image/jpeg'
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/guest/gallery
 * Personalized gallery — FR-GALLERY-001 through 005.
 * Requires guest auth.
 */
async function getPersonalizedGallery(req, res, next) {
  try {
    const result = await guestService.getPersonalizedGallery(req.guestId, req.eventId);

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/guest/consent/withdraw
 * Withdraw consent and delete face data — FR-GUEST-005.
 * Requires guest auth.
 */
async function withdrawConsent(req, res, next) {
  try {
    const result = await guestService.withdrawConsent(req.guestId);

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getEventByQr,
  getBrowsableGallery,
  recordConsent,
  uploadSelfie,
  getPersonalizedGallery,
  withdrawConsent,
};
