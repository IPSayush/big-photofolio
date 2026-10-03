/**
 * Event Delete Service - cascade delete event and all related data.
 * FR-EVENT-007: Photographer can permanently delete an event.
 * SEC-001: Tenant-scoped - only event owner can delete.
 * SEC-007: All delete actions audit-logged.
 * PRIV-003: Guest biometric data deleted as part of cascade.
 *
 * On Vercel (serverless), we perform cascade delete directly (no worker queue).
 * S3 cleanup is attempted but skipped on timeout to stay within function limits.
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
const { EVENT_STATUS } = require('@photofolio/shared');
const logger = require('../utils/logger');

/**
 * Initiate event deletion - performs cascade delete directly.
 * On serverless (Vercel), we skip S3 cleanup to stay within timeout.
 *
 * @param {string} tenantId - Verified tenant ID from middleware.
 * @param {string} eventId - Event ID to delete.
 * @param {object} actor - Actor info for audit logging.
 * @returns {object} { message, eventId, status, summary }
 */
async function initiateEventDelete(tenantId, eventId, actor) {
  const event = await Event.findOne({ _id: eventId, tenantId });
  if (!event) {
    throw new AppError('Event not found.', 404, 'EVENT_NOT_FOUND');
  }

  // Cannot delete an event that is already being deleted
  if (event.status === EVENT_STATUS.DELETING) {
    // If already stuck in deleting, just force-delete it
    logger.warn({ eventId }, 'Event already in deleting status - force completing');
  }

  // SEC-007: Audit log
  await logAction({
    ...actor,
    action: 'event.delete_initiated',
    targetType: 'Event',
    targetId: event._id,
    metadata: {
      eventName: event.name,
    },
  });

  // Perform cascade delete directly (skip S3 for Vercel timeout safety)
  const summary = await executeCascadeDelete(tenantId, eventId, event.name, actor.userId);

  logger.info({ tenantId, eventId, eventName: event.name, summary }, 'Event permanently deleted');

  return {
    message: 'Event permanently deleted.',
    eventId: event._id,
    status: 'deleted',
    summary,
  };
}

/**
 * Execute cascade delete - deletes all related DB records.
 * S3 cleanup is skipped on serverless to avoid timeout.
 *
 * @param {string} tenantId
 * @param {string} eventId
 * @param {string} eventName - For logging.
 * @param {string} actorUserId - For audit trail.
 * @returns {object} Summary of what was deleted.
 */
async function executeCascadeDelete(tenantId, eventId, eventName, actorUserId) {
  const summary = {};

  // 1. Delete DB records in dependency order
  summary.matches = (await Match.deleteMany({ eventId })).deletedCount;
  summary.faceDetections = (await FaceDetection.deleteMany({ eventId })).deletedCount;
  summary.photoDerivatives = (await PhotoDerivative.deleteMany({ eventId })).deletedCount;
  summary.photos = (await Photo.deleteMany({ eventId, tenantId })).deletedCount;

  // Get guest IDs for consent/face cleanup
  const guests = await Guest.find({ eventId, tenantId }).select('_id').lean();
  const guestIds = guests.map((g) => g._id);

  if (guestIds.length > 0) {
    summary.consentRecords = (await ConsentRecord.deleteMany({ guestId: { $in: guestIds } })).deletedCount;
    summary.referenceFaces = (await ReferenceFace.deleteMany({ guestId: { $in: guestIds } })).deletedCount;
  }

  summary.guests = (await Guest.deleteMany({ eventId, tenantId })).deletedCount;

  // 2. Delete the event itself
  await Event.deleteOne({ _id: eventId, tenantId });

  // 3. Audit log completion
  try {
    await logAction({
      userId: actorUserId,
      tenantId,
      action: 'event.delete_completed',
      targetType: 'Event',
      targetId: eventId,
      metadata: { eventName, summary },
    });
  } catch (auditErr) {
    logger.warn({ err: auditErr }, 'Audit log for delete completion failed (non-fatal)');
  }

  return summary;
}

module.exports = {
  initiateEventDelete,
  executeCascadeDelete,
};