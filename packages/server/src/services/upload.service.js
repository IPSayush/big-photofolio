/**
 * Upload Service â€” photo upload business logic.
 * FR-UPLOAD-001: Bulk upload event photos post-event.
 * FR-UPLOAD-002: Pre-signed S3 URLs (no proxying through app server).
 * FR-UPLOAD-003: Batch tracking for resumable uploads.
 * FR-UPLOAD-004: Validate file type/size against configurable limits.
 * FR-UPLOAD-005: Duplicate detection via SHA-256 hash.
 * FR-UPLOAD-007: Upload status tracking.
 * FR-PLAN-003: Enforce maxPhotosPerEvent from Plan config.
 *
 * SEC-001/SEC-002: Every query filters by tenantId from verified middleware.
 */

const crypto = require('crypto');
const Photo = require('../models/Photo');
const PhotoDerivative = require('../models/PhotoDerivative');
const Event = require('../models/Event');
const Plan = require('../models/Plan');
const Tenant = require('../models/Tenant');
const { AppError } = require('../middleware/errorHandler');
const { logAction } = require('./audit.service');
const { generatePresignedPutUrl, buildOriginalPhotoKey } = require('../utils/s3');
const { getImageProcessingQueue } = require('../config/queue');
const env = require('../config/env');
const logger = require('../utils/logger');
const { EVENT_STATUS, PHOTO_STATUS } = require('@photofolio/shared');

/**
 * Request pre-signed upload URLs for a batch of files.
 * FR-UPLOAD-002: Client uploads directly to S3 via these URLs.
 * FR-UPLOAD-004: Validates file type and size against configurable limits.
 * FR-UPLOAD-005: Detects duplicates by hash within the event.
 * FR-PLAN-003: Enforces maxPhotosPerEvent quota from Plan config.
 *
 * @param {string} tenantId - Verified tenant ID from middleware.
 * @param {string} eventId - Event ID from route param.
 * @param {Array} files - Array of { fileName, contentType, sizeBytes, hash }.
 * @param {object} actor - Actor info for audit logging.
 * @returns {object} { batchId, files: [{ photoId, uploadUrl, s3Key, isDuplicate }] }
 */
async function requestUploadUrls(tenantId, eventId, files, actor) {
  // Verify event exists and belongs to tenant â€” SEC-001
  const event = await Event.findOne({ _id: eventId, tenantId });
  if (!event) {
    throw new AppError('Event not found.', 404, 'EVENT_NOT_FOUND');
  }

  // Cannot upload to archived events â€” FR-EVENT-005
  if (event.status === EVENT_STATUS.ARCHIVED) {
    throw new AppError(
      'Cannot upload photos to an archived event.',
      400,
      'EVENT_ARCHIVED'
    );
  }

  // FR-UPLOAD-004: Validate batch size â€” NFR-MAINT-001: limit from config
  if (files.length > env.upload.maxBatchSize) {
    throw new AppError(
      `Batch size exceeds maximum of ${env.upload.maxBatchSize} files per request.`,
      400,
      'BATCH_TOO_LARGE'
    );
  }

  // FR-UPLOAD-004: Validate each file's type and size against configurable limits
  const fileErrors = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    if (!env.upload.allowedMimeTypes.includes(file.contentType)) {
      fileErrors.push({
        index: i,
        fileName: file.fileName,
        error: `File type "${file.contentType}" is not allowed. Allowed: ${env.upload.allowedMimeTypes.join(', ')}`,
      });
    }

    if (file.sizeBytes > env.upload.maxFileSizeBytes) {
      const maxMB = Math.round(env.upload.maxFileSizeBytes / (1024 * 1024));
      fileErrors.push({
        index: i,
        fileName: file.fileName,
        error: `File size (${Math.round(file.sizeBytes / (1024 * 1024))} MB) exceeds maximum of ${maxMB} MB.`,
      });
    }
  }

  if (fileErrors.length > 0) {
    const err = new AppError('Some files failed validation.', 400, 'FILE_VALIDATION_FAILED');
    err.details = fileErrors;
    throw err;
  }

  // FR-PLAN-003: Check maxPhotosPerEvent quota â€” read from Plan config, never hardcoded
  const tenant = await Tenant.findById(tenantId);
  if (tenant && tenant.planId) {
    const plan = await Plan.findById(tenant.planId);
    if (plan) {
      const currentPhotoCount = await Photo.countDocuments({ eventId, tenantId });
      const newTotal = currentPhotoCount + files.length;

      if (newTotal > plan.quotas.maxPhotosPerEvent) {
        const remaining = Math.max(0, plan.quotas.maxPhotosPerEvent - currentPhotoCount);
        throw new AppError(
          `Photo limit would be exceeded. Your plan allows ${plan.quotas.maxPhotosPerEvent} photos per event. ` +
          `Currently ${currentPhotoCount} uploaded, trying to add ${files.length}. ` +
          `${remaining} slots remaining.`,
          403,
          'PHOTO_QUOTA_EXCEEDED'
        );
      }
    }
  }

  // FR-UPLOAD-005: Check for duplicates by hash within this event
  const hashes = files.map((f) => f.hash);
  const existingPhotos = await Photo.find(
    { eventId, hash: { $in: hashes } },
    { hash: 1 }
  );
  const existingHashes = new Set(existingPhotos.map((p) => p.hash));

  // Generate batch ID for grouping â€” FR-UPLOAD-003
  const batchId = crypto.randomUUID();

  // Create Photo records and generate pre-signed URLs
  const results = [];

  for (const file of files) {
    const isDuplicate = existingHashes.has(file.hash);

    if (isDuplicate) {
      // FR-UPLOAD-005: Flag duplicate, don't create a new record
      results.push({
        fileName: file.fileName,
        isDuplicate: true,
        uploadUrl: null,
        photoId: null,
        s3Key: null,
      });
      continue;
    }

    // Create Photo record with status=uploaded
    // Pre-generate ObjectId so we can build the S3 key before creating the record
    const photoId = new (require('mongoose').Types.ObjectId)();
    const s3Key = buildOriginalPhotoKey(tenantId, eventId, photoId, file.fileName);

    const photo = await Photo.create({
      _id: photoId,
      tenantId,
      eventId,
      originalFileName: file.fileName,
      contentType: file.contentType,
      sizeBytes: file.sizeBytes,
      hash: file.hash,
      uploadBatchId: batchId,
      status: PHOTO_STATUS.UPLOADED,
      s3OriginalKey: s3Key,
    });

    // FR-UPLOAD-002: Generate pre-signed PUT URL
    const uploadUrl = await generatePresignedPutUrl(
      env.aws.s3BucketOriginals,
      s3Key,
      file.contentType
    );

    // Track hash to avoid duplicates within the same batch
    existingHashes.add(file.hash);

    results.push({
      fileName: file.fileName,
      isDuplicate: false,
      uploadUrl,
      photoId: photo._id,
      s3Key,
    });
  }

  // Update event stats â€” FR-EVENT-006
  const newPhotosCreated = results.filter((r) => !r.isDuplicate).length;
  if (newPhotosCreated > 0) {
    await Event.findByIdAndUpdate(eventId, {
      $inc: { 'stats.photoCount': newPhotosCreated },
    });
  }

  // SEC-007: Audit log
  await logAction({
    ...actor,
    action: 'photo.upload_urls_requested',
    targetType: 'Event',
    targetId: eventId,
    metadata: {
      batchId,
      totalFiles: files.length,
      newPhotos: newPhotosCreated,
      duplicatesSkipped: files.length - newPhotosCreated,
    },
  });

  logger.info(
    { tenantId, eventId, batchId, count: newPhotosCreated },
    'Upload URLs generated'
  );

  return { batchId, files: results };
}

/**
 * Confirm that uploads to S3 completed successfully.
 * FR-UPLOAD-003: Enables batch-level resumability â€” client confirms each file.
 *
 * @param {string} tenantId - Verified tenant ID from middleware.
 * @param {string} eventId - Event ID.
 * @param {Array<string>} photoIds - IDs of photos that were successfully uploaded.
 * @returns {object} { confirmed }
 */
async function confirmUpload(tenantId, eventId, photoIds) {
  // SEC-001: Only confirm photos belonging to this tenant+event
  const result = await Photo.updateMany(
    {
      _id: { $in: photoIds },
      tenantId,
      eventId,
      uploadConfirmed: false,
    },
    { $set: { uploadConfirmed: true } }
  );

  // FR-PIPE-001: Enqueue confirmed photos for async processing
  if (result.modifiedCount > 0) {
    const confirmedPhotos = await Photo.find(
      { _id: { $in: photoIds }, tenantId, eventId, uploadConfirmed: true },
      { _id: 1, s3OriginalKey: 1 }
    );

    const queue = getImageProcessingQueue();
    for (const photo of confirmedPhotos) {
      await queue.add('process-photo', {
        photoId: photo._id.toString(),
        tenantId: tenantId.toString(),
        eventId: eventId.toString(),
        s3OriginalKey: photo.s3OriginalKey,
      }, {
        attempts: 3,              // FR-PIPE-003: Retryable
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,    // Keep last 100 completed jobs
        removeOnFail: 500,        // Keep last 500 failed jobs for debugging
      });
    }

    // Update status to validating â€” pipeline has started
    await Photo.updateMany(
      { _id: { $in: photoIds }, tenantId, eventId, status: PHOTO_STATUS.UPLOADED },
      { $set: { status: PHOTO_STATUS.VALIDATING } }
    );

    logger.info(
      { tenantId, eventId, enqueued: confirmedPhotos.length },
      'Photos enqueued for processing'
    );
  }

  logger.info(
    { tenantId, eventId, confirmed: result.modifiedCount },
    'Uploads confirmed'
  );

  return { confirmed: result.modifiedCount, enqueued: result.modifiedCount };
}

/**
 * Get upload/processing status for an event.
 * FR-UPLOAD-007 / API-008: Processing and upload status summary.
 *
 * @param {string} tenantId - Verified tenant ID from middleware.
 * @param {string} eventId - Event ID.
 * @returns {object} Status counts by pipeline stage.
 */
async function getUploadStatus(tenantId, eventId) {
  // Verify event belongs to tenant â€” SEC-001
  const event = await Event.findOne({ _id: eventId, tenantId });
  if (!event) {
    throw new AppError('Event not found.', 404, 'EVENT_NOT_FOUND');
  }

  // Aggregate photo counts by status
  const statusCounts = await Photo.aggregate([
    { $match: { eventId: event._id, tenantId: event.tenantId } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const counts = {
    total: 0,
    uploaded: 0,
    validating: 0,
    processing: 0,
    processed: 0,
    failed: 0,
  };

  for (const entry of statusCounts) {
    if (counts.hasOwnProperty(entry._id)) {
      counts[entry._id] = entry.count;
    }
    counts.total += entry.count;
  }

  // Also include confirmation stats for resumability
  const unconfirmedCount = await Photo.countDocuments({
    eventId: event._id,
    tenantId: event.tenantId,
    uploadConfirmed: false,
    status: PHOTO_STATUS.UPLOADED,
  });

  return {
    ...counts,
    unconfirmed: unconfirmedCount,
    confirmed: counts.uploaded - unconfirmedCount,
  };
}

/**
 * List photos for an event with filters.
 * SEC-001: Filters by tenantId.
 *
 * @param {string} tenantId - Verified tenant ID from middleware.
 * @param {string} eventId - Event ID.
 * @param {object} filters - { status, page, limit }
 * @returns {object} { photos, pagination }
 */
async function listPhotos(tenantId, eventId, filters = {}) {
  // Verify event belongs to tenant â€” SEC-001
  const event = await Event.findOne({ _id: eventId, tenantId });
  if (!event) {
    throw new AppError('Event not found.', 404, 'EVENT_NOT_FOUND');
  }

  const { status, page = 1, limit = 50 } = filters;
  const query = { eventId: event._id, tenantId: event.tenantId };
  if (status) {
    query.status = status;
  }

  const skip = (page - 1) * limit;
  const [photos, total] = await Promise.all([
    Photo.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-s3OriginalKey'), // Don't expose S3 keys to client
    Photo.countDocuments(query),
  ]);

  return {
    photos: photos.map((p) => p.toJSON()),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get failed photos with failure reasons for retry UI.
 * FR-PIPE-004: Failed photos surfaced with reason and retry action.
 *
 * @param {string} tenantId - Verified tenant ID from middleware.
 * @param {string} eventId - Event ID.
 * @returns {object} { photos }
 */
async function getFailedPhotos(tenantId, eventId) {
  const event = await Event.findOne({ _id: eventId, tenantId });
  if (!event) {
    throw new AppError('Event not found.', 404, 'EVENT_NOT_FOUND');
  }

  const photos = await Photo.find({
    eventId: event._id,
    tenantId: event.tenantId,
    status: PHOTO_STATUS.FAILED,
  }).sort({ createdAt: -1 });

  return { photos: photos.map((p) => p.toJSON()) };
}

/**
 * Retry failed photos â€” re-enqueue for processing.
 * FR-PIPE-004: Failed photos can be retried by the photographer.
 *
 * @param {string} tenantId - Verified tenant ID from middleware.
 * @param {string} eventId - Event ID.
 * @param {Array<string>} photoIds - IDs of failed photos to retry.
 * @param {object} actor - Actor info for audit logging.
 * @returns {object} { retried }
 */
async function retryFailedPhotos(tenantId, eventId, photoIds, actor) {
  // Verify event belongs to tenant â€” SEC-001
  const event = await Event.findOne({ _id: eventId, tenantId });
  if (!event) {
    throw new AppError('Event not found.', 404, 'EVENT_NOT_FOUND');
  }

  // Only retry photos that are actually failed â€” SEC-001
  const failedPhotos = await Photo.find({
    _id: { $in: photoIds },
    tenantId,
    eventId,
    status: PHOTO_STATUS.FAILED,
  });

  if (failedPhotos.length === 0) {
    return { retried: 0 };
  }

  // Reset status and clear failure reason
  const failedIds = failedPhotos.map((p) => p._id);
  await Photo.updateMany(
    { _id: { $in: failedIds } },
    { $set: { status: PHOTO_STATUS.VALIDATING, failureReason: null } }
  );

  // Re-enqueue for processing â€” FR-PIPE-001
  const queue = getImageProcessingQueue();
  for (const photo of failedPhotos) {
    await queue.add('process-photo', {
      photoId: photo._id.toString(),
      tenantId: tenantId.toString(),
      eventId: eventId.toString(),
      s3OriginalKey: photo.s3OriginalKey,
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  }

  // SEC-007: Audit log
  await logAction({
    ...actor,
    action: 'photo.retry_processing',
    targetType: 'Event',
    targetId: eventId,
    metadata: { retriedCount: failedPhotos.length, photoIds: failedIds.map(String) },
  });

  logger.info(
    { tenantId, eventId, retried: failedPhotos.length },
    'Failed photos re-enqueued for processing'
  );

  return { retried: failedPhotos.length };
}


/**
 * Reprocess stuck photos - re-enqueue photos that are stuck in uploaded/validating status.
 * This is a repair function for when the Redis queue was unavailable during upload.
 *
 * @param {string} tenantId - Verified tenant ID from middleware.
 * @param {string} eventId - Event ID.
 * @param {object} actor - Actor info for audit logging.
 * @returns {object} { reprocessed }
 */
async function reprocessStuckPhotos(tenantId, eventId, actor) {
  // Verify event belongs to tenant
  const event = await Event.findOne({ _id: eventId, tenantId });
  if (!event) {
    throw new AppError('Event not found.', 404, 'EVENT_NOT_FOUND');
  }

  // Find photos stuck in uploaded or validating status that were confirmed
  const stuckPhotos = await Photo.find({
    eventId: event._id,
    tenantId: event.tenantId,
    status: { $in: [PHOTO_STATUS.UPLOADED, PHOTO_STATUS.VALIDATING] },
    uploadConfirmed: true,
  });

  if (stuckPhotos.length === 0) {
    return { reprocessed: 0 };
  }

  // Reset status to validating and re-enqueue
  const stuckIds = stuckPhotos.map((p) => p._id);
  await Photo.updateMany(
    { _id: { $in: stuckIds } },
    { $set: { status: PHOTO_STATUS.VALIDATING, failureReason: null } }
  );

  // Re-enqueue for processing
  const queue = getImageProcessingQueue();
  for (const photo of stuckPhotos) {
    await queue.add('process-photo', {
      photoId: photo._id.toString(),
      tenantId: tenantId.toString(),
      eventId: eventId.toString(),
      s3OriginalKey: photo.s3OriginalKey,
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  }

  // Audit log
  await logAction({
    ...actor,
    action: 'photo.reprocess_stuck',
    targetType: 'Event',
    targetId: eventId,
    metadata: { reprocessedCount: stuckPhotos.length, photoIds: stuckIds.map(String) },
  });

  logger.info(
    { tenantId, eventId, reprocessed: stuckPhotos.length },
    'Stuck photos re-enqueued for processing'
  );

  return { reprocessed: stuckPhotos.length };
}


/**
 * Fix photo statuses - mark photos as 'processed' if their derivatives exist in DB.
 * This is a repair function for when the worker processed photos but failed to update
 * the photo status in MongoDB (e.g., due to connection issues or ObjectId mismatch).
 *
 * @param {string} tenantId - Verified tenant ID from middleware.
 * @param {string} eventId - Event ID.
 * @returns {object} { fixed }
 */
async function fixPhotoStatuses(tenantId, eventId) {
  const event = await Event.findOne({ _id: eventId, tenantId });
  if (!event) {
    throw new AppError('Event not found.', 404, 'EVENT_NOT_FOUND');
  }

  // Find photos that are NOT in 'processed' status
  const stuckPhotos = await Photo.find({
    eventId: event._id,
    tenantId: event.tenantId,
    status: { $in: [PHOTO_STATUS.UPLOADED, PHOTO_STATUS.VALIDATING, PHOTO_STATUS.PROCESSING] },
  });

  if (stuckPhotos.length === 0) {
    return { fixed: 0, details: [] };
  }

  const details = [];
  let fixedCount = 0;

  for (const photo of stuckPhotos) {
    // Check if derivatives exist for this photo
    const derivativeCount = await PhotoDerivative.countDocuments({ photoId: photo._id });
    if (derivativeCount >= 3) {
      // Photo has all 3 derivatives (thumbnail, web_optimized, watermarked) - mark as processed
      await Photo.findByIdAndUpdate(photo._id, {
        status: PHOTO_STATUS.PROCESSED,
        failureReason: null,
      });
      fixedCount++;
      details.push({ photoId: photo._id.toString(), oldStatus: photo.status, derivativeCount });
    }
  }

  logger.info(
    { tenantId, eventId, fixed: fixedCount, total: stuckPhotos.length },
    'Photo statuses fixed based on derivative existence'
  );

  return { fixed: fixedCount, total: stuckPhotos.length, details };
}


/**
 * Force-mark photos as processed. Emergency repair when worker processed
 * photos but ALL MongoDB updates from worker side failed.
 * This directly sets status to processed on the server side.
 */
async function forceMarkProcessed(tenantId, eventId) {
  const event = await Event.findOne({ _id: eventId, tenantId });
  if (!event) {
    throw new AppError('Event not found.', 404, 'EVENT_NOT_FOUND');
  }

  const result = await Photo.updateMany(
    {
      eventId: event._id,
      tenantId: event.tenantId,
      status: { $in: [PHOTO_STATUS.UPLOADED, PHOTO_STATUS.VALIDATING, PHOTO_STATUS.PROCESSING] },
      uploadConfirmed: true,
    },
    { $set: { status: PHOTO_STATUS.PROCESSED, failureReason: null } }
  );

  logger.info(
    { tenantId, eventId, modified: result.modifiedCount },
    'Photos force-marked as processed'
  );

  return { fixed: result.modifiedCount };
}


/**
 * Reset one photo to 'uploaded' status for testing worker processing.
 * DEBUG ONLY - remove after fixing worker MongoDB issue.
 */
async function resetPhotoForTesting(tenantId, eventId) {
  const event = await Event.findOne({ _id: eventId, tenantId });
  if (!event) throw new AppError('Event not found.', 404, 'EVENT_NOT_FOUND');

  const photo = await Photo.findOne({ eventId: event._id, tenantId, status: PHOTO_STATUS.PROCESSED });
  if (!photo) return { reset: false, message: 'No processed photos found.' };

  photo.status = PHOTO_STATUS.UPLOADED;
  await photo.save();

  // Enqueue it for processing
  const queue = getImageProcessingQueue();
  await queue.add('process-image', {
    photoId: photo._id.toString(),
    tenantId: tenantId.toString(),
    eventId: eventId.toString(),
    s3OriginalKey: photo.s3OriginalKey,
  }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  });

  return { reset: true, photoId: photo._id.toString(), message: 'Photo reset and enqueued for worker debug test.' };
}

module.exports = {
  requestUploadUrls,
  confirmUpload,
  getUploadStatus,
  listPhotos,
  getFailedPhotos,
  retryFailedPhotos,
  reprocessStuckPhotos,
  fixPhotoStatuses,
  forceMarkProcessed,
  resetPhotoForTesting,
};




