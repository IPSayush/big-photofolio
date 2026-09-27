/**
 * Event Delete Service - cascade delete event and all related data.
 * FR-EVENT-007: Photographer can permanently delete an event.
 * SEC-001: Tenant-scoped - only event owner can delete.
 * SEC-007: All delete actions audit-logged.
 * PRIV-003: Guest biometric data deleted as part of cascade.
 *
 * The API marks the event as "deleting" and enqueues a job.
 * The worker performs the actual cascade deletion (DB + S3).
 */

const Event = require('../models/Event');
const Photo = require('../models/Photo');
const PhotoDerivative = require('../models/PhotoDerivative');
const FaceDetection = require('../models/FaceDetection');
const Match = require('../models/Match');
const Guest = require('../models/Guest');
const ConsentRecord = require('../models/ConsentRecord');
const ReferenceFace = require('../models/ReferenceFace');
const { AppError } = require('../middleware/errorHandler');
const { logAction } = require('./audit.service');
const { batchDeleteObjects } = require('../utils/s3');
const { getEventDeleteQueue } = require('../config/queue');
const { EVENT_STATUS } = require('@photofolio/shared');
const logger = require('../utils/logger');
const env = require('../config/env');

/**
 * Initiate event deletion - marks event as "deleting" and enqueues async job.
 * Called by the API controller.
 *
 * @param {string} tenantId - Verified tenant ID from middleware.
 * @param {string} eventId - Event ID to delete.
 * @param {object} actor - Actor info for audit logging.
 * @returns {object} { message, eventId, status }
 */
async function initiateEventDelete(tenantId, eventId, actor) {
  const event = await Event.findOne({ _id: eventId, tenantId });
  if (!event) {
    throw new AppError('Event not found.', 404, 'EVENT_NOT_FOUND');
  }

  // Cannot delete an event that is already being deleted
  if (event.status === EVENT_STATUS.DELETING) {
    throw new AppError('Event is already being deleted.', 409, 'EVENT_ALREADY_DELETING');
  }

  // Mark as deleting - prevents further operations on this event
  event.status = EVENT_STATUS.DELETING;
  await event.save();

  // SEC-007: Audit log
  await logAction({
    ...actor,
    action: 'event.delete_initiated',
    targetType: 'Event',
    targetId: event._id,
    metadata: {
      eventName: event.name,
      photoCount: event.stats?.photoCount || 0,
      guestCount: event.stats?.guestCount || 0,
    },
  });

  // Enqueue async cascade delete job
  // Wrap in timeout — Vercel serverless has 30s limit, Redis connect may be slow
  try {
    const queue = getEventDeleteQueue();
    await Promise.race([
      queue.add('cascade-delete', {
        tenantId: tenantId.toString(),
        eventId: eventId.toString(),
        eventName: event.name,
        actorUserId: actor.userId,
      }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: false,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Queue timeout')), 10000)),
    ]);
  } catch (queueErr) {
    // If queue fails, still respond — event is marked as deleting
    // A scheduled cleanup job or manual retry can pick it up later
    logger.warn({ err: queueErr, eventId }, 'Failed to enqueue delete job — event marked as deleting');
  }

  logger.info({ tenantId, eventId, eventName: event.name }, 'Event delete initiated');

  return {
    message: 'Event deletion initiated. All data will be permanently removed.',
    eventId: event._id,
    status: 'deleting',
  };
}

/**
 * Execute cascade delete - called by the worker.
 * Deletes all related DB records and S3 objects.
 *
 * @param {string} tenantId
 * @param {string} eventId
 * @param {string} eventName - For logging.
 * @param {string} actorUserId - For audit trail.
 * @returns {object} Summary of what was deleted.
 */
async function executeCascadeDelete(tenantId, eventId, eventName, actorUserId) {
  const summary = {
    matches: 0,
    faceDetections: 0,
    photoDerivatives: 0,
    photos: 0,
    guests: 0,
    consentRecords: 0,
    referenceFaces: 0,
    s3Objects: 0,
  };

  logger.info({ tenantId, eventId, eventName }, 'Starting cascade delete');

  // 1. Collect S3 keys before deleting DB records
  const photos = await Photo.find({ eventId, tenantId }).select('s3OriginalKey').lean();
  const derivatives = await PhotoDerivative.find({ eventId }).select('s3Key').lean();

  const s3KeysOriginals = photos.map((p) => p.s3OriginalKey).filter(Boolean);
  const s3KeysDerivatives = derivatives.map((d) => d.s3Key).filter(Boolean);

  // 2. Delete DB records in dependency order
  const matchResult = await Match.deleteMany({ eventId });
  summary.matches = matchResult.deletedCount;

  const faceResult = await FaceDetection.deleteMany({ eventId });
  summary.faceDetections = faceResult.deletedCount;

  const derivResult = await PhotoDerivative.deleteMany({ eventId });
  summary.photoDerivatives = derivResult.deletedCount;

  const photoResult = await Photo.deleteMany({ eventId, tenantId });
  summary.photos = photoResult.deletedCount;

  // Get guest IDs for consent/face cleanup
  const guests = await Guest.find({ eventId, tenantId }).select('_id').lean();
  const guestIds = guests.map((g) => g._id);

  if (guestIds.length > 0) {
    const consentResult = await ConsentRecord.deleteMany({ guestId: { $in: guestIds } });
    summary.consentRecords = consentResult.deletedCount;

    const refFaceResult = await ReferenceFace.deleteMany({ guestId: { $in: guestIds } });
    summary.referenceFaces = refFaceResult.deletedCount;
  }

  const guestResult = await Guest.deleteMany({ eventId, tenantId });
  summary.guests = guestResult.deletedCount;

  // 3. Delete S3 objects (originals + derivatives)
  try {
    if (s3KeysOriginals.length > 0) {
      const deleted = await batchDeleteObjects(env.aws.s3BucketOriginals, s3KeysOriginals);
      summary.s3Objects += deleted;
    }
    if (s3KeysDerivatives.length > 0) {
      const bucket = env.aws.s3BucketDerivatives || env.aws.s3BucketOriginals;
      const deleted = await batchDeleteObjects(bucket, s3KeysDerivatives);
      summary.s3Objects += deleted;
    }
  } catch (s3Err) {
    // Log but don't fail the job - DB records are already gone
    logger.error({ err: s3Err, eventId }, 'S3 cleanup failed during cascade delete');
  }

  // 4. Finally delete the event itself
  await Event.deleteOne({ _id: eventId, tenantId });

  // SEC-007: Audit log completion
  await logAction({
    userId: actorUserId,
    tenantId,
    action: 'event.delete_completed',
    targetType: 'Event',
    targetId: eventId,
    metadata: { eventName, summary },
  });

  logger.info({ tenantId, eventId, eventName, summary }, 'Cascade delete completed');

  return summary;
}

module.exports = {
  initiateEventDelete,
  executeCascadeDelete,
};
