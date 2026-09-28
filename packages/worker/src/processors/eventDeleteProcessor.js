/**
 * Event Delete Processor - handles cascade-delete jobs.
 * FR-EVENT-007: Async cascade delete of event data from DB and S3.
 *
 * This processor runs in the worker (Railway), not in the API server (Vercel).
 * It uses the worker's own Mongoose model references (which share the same
 * mongoose.models registry as the server models due to guard pattern).
 *
 * IMPORTANT: Do NOT require() from packages/server/ — that causes
 * OverwriteModelError when both server and worker model files try to
 * register the same Mongoose model name. Use worker's own models.
 */

const mongoose = require('mongoose');
const pino = require('pino');

const Photo = require('../models/Photo');
const PhotoDerivative = require('../models/PhotoDerivative');
const FaceDetection = require('../models/FaceDetection');
const Match = require('../models/Match');
const ReferenceFace = require('../models/ReferenceFace');
const Event = require('../models/Event');

// These models may not have worker-local copies — use mongoose.models
// (they'll be registered by the server's models if loaded, or we load them here)
function getModel(name) {
  return mongoose.models[name] || null;
}

const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
});

/**
 * Process an event cascade delete job.
 * Deletes all related DB records and S3 objects for an event.
 *
 * @param {import('bullmq').Job} job
 * @returns {Promise<object>} Delete summary
 */
async function processEventDelete(job) {
  const { tenantId, eventId, eventName, actorUserId } = job.data;
  const startTime = Date.now();

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

  // Get Guest model — may be server-only, use mongoose.models
  const Guest = getModel('Guest');
  const ConsentRecord = getModel('ConsentRecord');

  if (Guest) {
    const guests = await Guest.find({ eventId, tenantId }).select('_id').lean();
    const guestIds = guests.map((g) => g._id);

    if (guestIds.length > 0 && ConsentRecord) {
      const consentResult = await ConsentRecord.deleteMany({ guestId: { $in: guestIds } });
      summary.consentRecords = consentResult.deletedCount;
    }

    if (guestIds.length > 0) {
      const refFaceResult = await ReferenceFace.deleteMany({ guestId: { $in: guestIds } });
      summary.referenceFaces = refFaceResult.deletedCount;
    }

    const guestResult = await Guest.deleteMany({ eventId, tenantId });
    summary.guests = guestResult.deletedCount;
  }

  // 3. S3 cleanup — try to batch delete, but don't fail the job if S3 errors
  try {
    if (s3KeysOriginals.length > 0 || s3KeysDerivatives.length > 0) {
      const { S3Client, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
      const s3Client = new S3Client({
        region: process.env.AWS_REGION || 'ap-south-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      });

      // Batch delete originals
      if (s3KeysOriginals.length > 0) {
        const bucketOrig = process.env.S3_BUCKET_ORIGINALS || 'photofolio-originals';
        for (let i = 0; i < s3KeysOriginals.length; i += 1000) {
          const batch = s3KeysOriginals.slice(i, i + 1000);
          await s3Client.send(new DeleteObjectsCommand({
            Bucket: bucketOrig,
            Delete: { Objects: batch.map((k) => ({ Key: k })), Quiet: true },
          }));
          summary.s3Objects += batch.length;
        }
      }

      // Batch delete derivatives
      if (s3KeysDerivatives.length > 0) {
        const bucketDeriv = process.env.S3_BUCKET_DERIVATIVES || process.env.S3_BUCKET_ORIGINALS || 'photofolio-derivatives';
        for (let i = 0; i < s3KeysDerivatives.length; i += 1000) {
          const batch = s3KeysDerivatives.slice(i, i + 1000);
          await s3Client.send(new DeleteObjectsCommand({
            Bucket: bucketDeriv,
            Delete: { Objects: batch.map((k) => ({ Key: k })), Quiet: true },
          }));
          summary.s3Objects += batch.length;
        }
      }
    }
  } catch (s3Err) {
    logger.error({ err: s3Err, eventId }, 'S3 cleanup failed during cascade delete');
  }

  // 4. Delete the event itself
  await Event.deleteOne({ _id: eventId, tenantId });

  // 5. Audit log — use AuditLog model if available
  const AuditLog = getModel('AuditLog');
  if (AuditLog) {
    try {
      await AuditLog.create({
        userId: actorUserId,
        tenantId,
        action: 'event.delete_completed',
        targetType: 'Event',
        targetId: eventId,
        metadata: { eventName, summary },
      });
    } catch (auditErr) {
      logger.warn({ err: auditErr }, 'Failed to create audit log for delete');
    }
  }

  const durationMs = Date.now() - startTime;
  logger.info({ tenantId, eventId, eventName, summary, durationMs }, 'Cascade delete completed');

  return { ...summary, durationMs };
}

module.exports = { processEventDelete };
