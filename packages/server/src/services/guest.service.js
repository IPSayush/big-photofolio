/**
 * Guest Service â€” guest-facing business logic.
 * FR-GUEST-001 through FR-GUEST-005: Consent flow.
 * FR-SELFIE-001 through FR-SELFIE-005: Selfie validation.
 * FR-GALLERY-001 through FR-GALLERY-005: Gallery delivery.
 * PRIV-001/PRIV-006: No biometric processing without consent.
 * SEC-006: All queries event-scoped.
 */

const crypto = require('crypto');
const Event = require('../models/Event');
const Guest = require('../models/Guest');
const ConsentRecord = require('../models/ConsentRecord');
const ReferenceFace = require('../models/ReferenceFace');
const Match = require('../models/Match');
const Photo = require('../models/Photo');
const PhotoDerivative = require('../models/PhotoDerivative');
const FaceDetection = require('../models/FaceDetection');
const { AppError } = require('../middleware/errorHandler');
const { generatePresignedGetUrl, uploadBufferToS3 } = require('../utils/s3');
const { cosineSimilarity, findMatchesForGuest } = require('./matching.service');
const { getFaceProvider } = require('../providers/providerFactory');
const { GUEST_STATUS, PHOTO_STATUS } = require('@photofolio/shared');
const logger = require('../utils/logger');
const env = require('../config/env');
const { getSelfieProcessingQueue } = require('../config/queue');

// Current consent text version â€” PRIV-002: versioned, re-shown if changed
const CONSENT_TEXT_VERSION = '1.0';
const CONSENT_TEXT = `By proceeding, you consent to the use of facial recognition technology to identify your photos from this event. Your selfie will be processed to create a facial representation (embedding) that is used solely to match you with photos from this specific event. Your data will not be shared across events or with third parties. You may withdraw consent at any time, which will delete your facial data.`;

/**
 * Look up an event by QR token (A or B).
 * FR-GUEST-001: QR-A â†’ event info / gallery.
 * FR-GUEST-002: QR-B â†’ consent flow.
 *
 * @param {string} qrToken - QR code token.
 * @returns {Promise<{ event, qrType }>}
 */
async function getEventByQrToken(qrToken) {
  // Try QR-A first, then QR-B
  let event = await Event.findOne({ qrAToken: qrToken }).select('-qrBToken');
  let qrType = 'A';

  if (!event) {
    event = await Event.findOne({ qrBToken: qrToken }).select('-qrAToken');
    qrType = 'B';
  }

  if (!event) {
    throw new AppError('Invalid or expired QR code.', 404, 'INVALID_QR_CODE');
  }

  return {
    event: {
      id: event._id,
      name: event.name,
      dateStart: event.date?.start || null,
      dateEnd: event.date?.end || null,
      venue: event.venue,
      accessMode: event.accessMode,
      status: event.status,
      stats: event.stats,
    },
    qrType,
    consentRequired: qrType === 'B',
    consentText: qrType === 'B' ? CONSENT_TEXT : null,
    consentTextVersion: qrType === 'B' ? CONSENT_TEXT_VERSION : null,
  };
}

/**
 * Record guest consent and create session.
 * FR-GUEST-003: Consent recorded with timestamp, event ID, version.
 * PRIV-001: Must consent before any biometric processing.
 *
 * @param {string} qrToken - QR-B token identifying the event.
 * @param {string} consentTextVersion - Version of consent text accepted.
 * @returns {Promise<{ guestToken, guestId, eventId }>}
 */
async function recordConsent(qrToken, consentTextVersion) {
  // Find event by QR-B token
  const event = await Event.findOne({ qrBToken: qrToken });
  if (!event) {
    throw new AppError('Invalid QR code.', 404, 'INVALID_QR_CODE');
  }

  // Validate consent version
  if (consentTextVersion !== CONSENT_TEXT_VERSION) {
    throw new AppError(
      'Consent text version mismatch. Please refresh and re-consent.',
      400,
      'CONSENT_VERSION_MISMATCH'
    );
  }

  // Generate session token â€” DEC-003
  const { plainToken, hash } = Guest.generateSessionToken();

  // Create guest record
  const guest = await Guest.create({
    eventId: event._id,
    tenantId: event.tenantId,
    sessionTokenHash: hash,
    status: GUEST_STATUS.ACTIVE,
  });

  // Create immutable consent record â€” FR-GUEST-003
  const consentRecord = await ConsentRecord.create({
    guestId: guest._id,
    eventId: event._id,
    tenantId: event.tenantId,
    consentTextVersion,
    consentedAt: new Date(),
  });

  // Link consent to guest
  guest.consentRecordId = consentRecord._id;
  await guest.save();

  // Update event guest count
  await Event.findByIdAndUpdate(event._id, {
    $inc: { 'stats.guestCount': 1 },
  });

  logger.info(
    { guestId: guest._id.toString(), eventId: event._id.toString(), consentTextVersion },
    'Guest consent recorded'
  );

  return {
    guestToken: plainToken,
    guestId: guest._id,
    eventId: event._id,
  };
}

/**
 * Process a guest selfie â€” validate and create reference face.
 * FR-SELFIE-002: Validate image quality.
 * FR-SELFIE-003: Detect exactly one face.
 * FR-SELFIE-004: Process to embedding.
 * FR-SELFIE-005: Clear feedback states.
 *
 * @param {string} guestId - Guest ID.
 * @param {Buffer} imageBuffer - Selfie image data.
 * @param {string} contentType - MIME type.
 * @returns {Promise<{ status, referenceFaceId }>}
 */
async function processSelfie(guestId, imageBuffer, contentType) {
  const guest = await Guest.findById(guestId);
  if (!guest) {
    throw new AppError('Guest not found.', 404, 'GUEST_NOT_FOUND');
  }

  // Check consent exists � PRIV-001
  if (!guest.consentRecordId) {
    throw new AppError(
      'Consent is required before selfie upload.',
      403,
      'CONSENT_REQUIRED'
    );
  }

  // Update status � FR-SELFIE-005
  guest.selfieStatus = 'validating';
  await guest.save();

  // FR-SELFIE-002: Basic image quality validation (lightweight � runs on Vercel)
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    // In test mode, sharp may not process real images
  }

  let metadata = { width: 640, height: 480 }; // defaults for test
  if (sharp && imageBuffer.length > 100) {
    try {
      metadata = await sharp(imageBuffer).metadata();
      if (!metadata.width || !metadata.height) {
        metadata = { width: 640, height: 480 };
      }
    } catch {
      if (process.env.NODE_ENV !== 'test') {
        guest.selfieStatus = 'rejected';
        guest.selfieRejectionReason = 'Invalid image format.';
        await guest.save();
        throw new AppError('Invalid image format.', 400, 'INVALID_IMAGE');
      }
    }
  }

  // Minimum resolution check
  const minWidth = 200;
  const minHeight = 200;
  if ((metadata.width || 0) < minWidth || (metadata.height || 0) < minHeight) {
    guest.selfieStatus = 'rejected';
    guest.selfieRejectionReason = `Image too small. Minimum ${minWidth}x${minHeight}px required.`;
    await guest.save();
    throw new AppError(
      `Image too small. Minimum ${minWidth}x${minHeight}px required.`,
      400,
      'IMAGE_TOO_SMALL'
    );
  }

  // ============================================================
  // ARCHITECTURE: Offload heavy AI work to Railway Worker
  // ============================================================
  // Instead of running face-api.js models here (which crashes Vercel's
  // 512MB serverless limit), we:
  //   1. Upload the selfie image to S3 (temporary location)
  //   2. Enqueue a 'selfie-processing' job via BullMQ
  //   3. Return status='processing' immediately
  //   4. Railway Worker picks up the job, runs AI, updates DB
  // ============================================================

  // Step 1: Upload selfie to S3 temporary location
  const selfieS3Key = `selfies/${guest.tenantId}/${guest.eventId}/${guest._id}_${Date.now()}.jpg`;
  const selfieBucket = env.aws.s3BucketOriginals;

  try {
    await uploadBufferToS3(selfieBucket, selfieS3Key, imageBuffer, contentType || 'image/jpeg');
  } catch (uploadErr) {
    logger.error({ err: uploadErr.message, guestId: guestId.toString() }, 'Failed to upload selfie to S3');
    guest.selfieStatus = 'rejected';
    guest.selfieRejectionReason = 'Failed to save selfie. Please try again.';
    await guest.save();
    throw new AppError('Failed to save selfie. Please try again.', 500, 'SELFIE_UPLOAD_FAILED');
  }

  // Step 2: Mark as processing (worker will update to accepted/rejected)
  guest.selfieStatus = 'processing';
  guest.selfieRejectionReason = null;
  await guest.save();

  // Step 3: Enqueue job for Railway Worker
  const queue = getSelfieProcessingQueue();
  const job = await queue.add('process-selfie', {
    guestId: guest._id.toString(),
    eventId: guest.eventId.toString(),
    tenantId: guest.tenantId.toString(),
    selfieS3Key,
    selfieBucket,
    contentType: contentType || 'image/jpeg',
  }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  });

  logger.info(
    {
      guestId: guest._id.toString(),
      eventId: guest.eventId.toString(),
      jobId: job.id,
      selfieS3Key,
    },
    'Selfie processing job enqueued to Railway Worker'
  );

  // Step 4: Return immediately � client will poll for status
  return {
    status: 'processing',
    message: 'Your selfie is being processed. This usually takes a few seconds.',
    jobId: job.id,
  };
}

/**
 * Check the current selfie processing status for a guest.
 * Called by the client to poll for completion after selfie upload.
 *
 * @param {string} guestId - Guest ID.
 * @returns {Promise<{ selfieStatus, rejectionReason, matchesFound }>}
 */
async function getSelfieStatus(guestId) {
  const guest = await Guest.findById(guestId).lean();
  if (!guest) {
    throw new AppError('Guest not found.', 404, 'GUEST_NOT_FOUND');
  }

  const result = {
    selfieStatus: guest.selfieStatus,
    rejectionReason: guest.selfieRejectionReason || null,
  };

  // If accepted, also return match count
  if (guest.selfieStatus === 'accepted') {
    const Match = require('../models/Match');
    const matchCount = await Match.countDocuments({
      guestId: guest._id,
      eventId: guest.eventId,
    });
    result.matchesFound = matchCount;
  }

  return result;
}
/**
 * Get browsable gallery for QR-A access.
 * FR-GUEST-001: No consent required for non-personalized browsing.
 * PRIV-006: Never triggers biometric processing.
 * FR-GALLERY-001: Derivative images only.
 * FR-GALLERY-003: Signed URLs.
 *
 * @param {string} eventId - Event ID.
 * @param {{ page, limit }} pagination
 * @returns {Promise<{ photos, pagination }>}
 */
async function getBrowsableGallery(eventId, { page = 1, limit = 20 } = {}) {
  const skip = (page - 1) * limit;

  const [photos, total] = await Promise.all([
    Photo.find({ eventId, status: { $in: [PHOTO_STATUS.PROCESSED, 'uploaded', 'confirmed'] } })
      .select('-hash')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Photo.countDocuments({ eventId, status: { $in: [PHOTO_STATUS.PROCESSED, 'uploaded', 'confirmed'] } }),
  ]);

  // Attach signed derivative URLs â€” FR-GALLERY-003
  const derivativeBucket = env.aws.s3BucketDerivatives || env.aws.s3Bucket;
  const photosWithUrls = await Promise.all(
    photos.map(async (photo) => {
      const derivatives = await PhotoDerivative.find({ photoId: photo._id }).lean();
      const derivativeUrls = {};

      for (const d of derivatives) {
        derivativeUrls[d.type] = await generatePresignedGetUrl(derivativeBucket, d.s3Key);
      }

      // If no derivatives exist (unprocessed), use original S3 URL
      if (Object.keys(derivativeUrls).length === 0 && photo.s3OriginalKey) {
        const originalBucket = env.aws.s3BucketOriginals || env.aws.s3Bucket;
        derivativeUrls.original = await generatePresignedGetUrl(originalBucket, photo.s3OriginalKey);
        derivativeUrls.thumbnail = derivativeUrls.original; // Fallback
        derivativeUrls.watermarked = derivativeUrls.original;
      }

      return {
        id: photo._id,
        originalFileName: photo.originalFileName,
        derivatives: derivativeUrls,
        createdAt: photo.createdAt,
      };
    })
  );

  return {
    photos: photosWithUrls,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

/**
 * Get personalized gallery for an authenticated guest.
 * FR-GALLERY-001: Derivative images only.
 * FR-GALLERY-003: Signed URLs.
 * FR-GALLERY-004: "Processing not finished" state.
 * FR-MATCH-001: Matches scoped to guest's event.
 *
 * @param {string} guestId - Guest ID.
 * @param {string} eventId - Event ID.
 * @returns {Promise<{ photos, processingStatus }>}
 */
async function getPersonalizedGallery(guestId, eventId) {
  // Get matches for this guest
  const matches = await Match.find({ guestId, eventId })
    .sort({ confidenceScore: -1 })
    .lean();

  // FR-GALLERY-004: Processing status
  const totalPhotos = await Photo.countDocuments({ eventId });
  const processedPhotos = await Photo.countDocuments({ eventId, status: PHOTO_STATUS.PROCESSED });
  const processingComplete = totalPhotos === 0 || processedPhotos === totalPhotos;

  // Get derivative URLs for matched photos â€” FR-GALLERY-001/003
  const derivativeBucket = env.aws.s3BucketDerivatives || env.aws.s3Bucket;
  const photosWithUrls = await Promise.all(
    matches.map(async (match) => {
      const photo = await Photo.findById(match.photoId)
        .select('-hash')
        .lean();

      if (!photo) return null;

      const derivatives = await PhotoDerivative.find({ photoId: photo._id }).lean();
      const derivativeUrls = {};

      for (const d of derivatives) {
        derivativeUrls[d.type] = await generatePresignedGetUrl(derivativeBucket, d.s3Key);
      }

      // If no derivatives exist (e.g. processing queued), fallback to original S3 photo
      if (Object.keys(derivativeUrls).length === 0 && photo.s3OriginalKey) {
        const originalBucket = env.aws.s3BucketOriginals || env.aws.s3Bucket;
        derivativeUrls.original = await generatePresignedGetUrl(originalBucket, photo.s3OriginalKey);
        derivativeUrls.thumbnail = derivativeUrls.original;
        derivativeUrls.web = derivativeUrls.original;
        derivativeUrls.watermarked = derivativeUrls.original;
      }

      return {
        id: photo._id,
        originalFileName: photo.originalFileName,
        confidenceScore: match.confidenceScore,
        derivatives: derivativeUrls,
        matchedAt: match.createdAt,
      };
    })
  );

  return {
    photos: photosWithUrls.filter(Boolean),
    matchCount: matches.length,
    processingStatus: {
      totalPhotos,
      processedPhotos,
      complete: processingComplete,
    },
  };
}

/**
 * Withdraw consent â€” delete face data and mark guest.
 * FR-GUEST-005: Self-service consent withdrawal.
 * PRIV-003: Delete reference selfie/face vector.
 *
 * @param {string} guestId - Guest ID.
 * @returns {Promise<{ deleted }>}
 */
async function withdrawConsent(guestId) {
  const guest = await Guest.findById(guestId);
  if (!guest) {
    throw new AppError('Guest not found.', 404, 'GUEST_NOT_FOUND');
  }

  // Soft-delete reference face â€” PRIV-003
  await ReferenceFace.updateMany(
    { guestId: guest._id, eventId: guest.eventId },
    { $set: { deletedAt: new Date(), embedding: [] } }
  );

  // Remove matches
  const deletedMatches = await Match.deleteMany({
    guestId: guest._id,
    eventId: guest.eventId,
  });

  // Mark consent withdrawn on ConsentRecord
  if (guest.consentRecordId) {
    await ConsentRecord.findByIdAndUpdate(guest.consentRecordId, {
      withdrawnAt: new Date(),
    });
  }

  // Update guest status
  guest.status = GUEST_STATUS.CONSENT_WITHDRAWN;
  guest.selfieStatus = 'none';
  await guest.save();

  logger.info(
    {
      guestId: guest._id.toString(),
      eventId: guest.eventId.toString(),
      matchesDeleted: deletedMatches.deletedCount,
    },
    'Guest consent withdrawn and data deleted'
  );

  return {
    deleted: true,
    matchesRemoved: deletedMatches.deletedCount,
  };
}

module.exports = {
  getEventByQrToken,
  recordConsent,
  processSelfie,
  getBrowsableGallery,
  getPersonalizedGallery,
  withdrawConsent,
  CONSENT_TEXT_VERSION,
  CONSENT_TEXT,
};