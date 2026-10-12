/**
 * Selfie Processor — BullMQ job handler for guest selfie AI processing.
 * 
 * This processor runs on Railway Worker (NOT Vercel) because:
 * - face-api.js models require ~400-500MB RAM to load
 * - Vercel serverless functions have max 512MB RAM limit
 * - Railway has dedicated CPU/RAM for heavy AI processing
 *
 * Flow:
 *   1. Download selfie from S3 (uploaded by Vercel API)
 *   2. Run face detection (ssdMobilenetv1)
 *   3. Validate: exactly 1 face required
 *   4. Generate 128-d face embedding (faceRecognitionNet)
 *   5. Create/update ReferenceFace record
 *   6. Run matching against all FaceDetections in the event
 *   7. Update Guest.selfieStatus to 'accepted' or 'rejected'
 *
 * FR-SELFIE-003: Detect exactly one face.
 * FR-SELFIE-004: Process to embedding.
 * FR-MATCH-001: Matching strictly scoped to guest's own event.
 * FR-PIPE-003: Each stage independently retryable and idempotent.
 */

const pino = require('pino');
const config = require('../config');
const { downloadFromS3 } = require('../s3');
const { getFaceProvider } = require('../providers/providerFactory');
const Guest = require('../models/Guest');
const ReferenceFace = require('../models/ReferenceFace');
const FaceDetection = require('../models/FaceDetection');
const Match = require('../models/Match');
const Event = require('../models/Event');

const logger = pino({
  level: config.nodeEnv === 'production' ? 'info' : 'debug',
  transport:
    config.nodeEnv !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
      : undefined,
});

/**
 * Process a guest selfie — face detection, embedding, and matching.
 * Triggered after Vercel API uploads the selfie to S3 and enqueues this job.
 *
 * @param {import('bullmq').Job} job - { guestId, eventId, tenantId, selfieS3Key, selfieBucket, contentType }
 */
async function processSelfie(job) {
  const { guestId, eventId, tenantId, selfieS3Key, selfieBucket } = job.data;
  const startTime = Date.now();
  const faceProvider = getFaceProvider();

  logger.info(
    { guestId, eventId, provider: faceProvider.getProviderName(), jobId: job.id },
    'Selfie processing started on Railway Worker'
  );

  try {
    // --- Stage 1: Download selfie from S3 ---
    const imageBuffer = await downloadFromS3(selfieBucket, selfieS3Key);
    logger.debug({ guestId, sizeBytes: imageBuffer.length }, 'Selfie downloaded from S3');

    // --- Stage 2: Face Detection (FR-SELFIE-003) ---
    let detectedFaces = [];
    try {
      detectedFaces = await faceProvider.detectFaces(imageBuffer);
    } catch (detectErr) {
      logger.warn({ err: detectErr.message, guestId }, 'Face detection encountered an issue');
      await Guest.findByIdAndUpdate(guestId, {
        selfieStatus: 'rejected',
        selfieRejectionReason: 'Could not process face in image. Please try again with clear lighting.',
      });
      return { guestId, status: 'rejected', reason: 'face_detection_failed' };
    }

    // Validate: exactly 1 face required
    if (detectedFaces.length === 0) {
      await Guest.findByIdAndUpdate(guestId, {
        selfieStatus: 'rejected',
        selfieRejectionReason: 'No face detected in selfie. Please ensure your face is well-lit and clearly visible.',
      });
      logger.info({ guestId }, 'Selfie rejected: no face detected');
      return { guestId, status: 'rejected', reason: 'no_face' };
    }

    if (detectedFaces.length > 1) {
      await Guest.findByIdAndUpdate(guestId, {
        selfieStatus: 'rejected',
        selfieRejectionReason: `Multiple faces detected (${detectedFaces.length}). Please take a selfie with only yourself.`,
      });
      logger.info({ guestId, facesDetected: detectedFaces.length }, 'Selfie rejected: multiple faces');
      return { guestId, status: 'rejected', reason: 'multiple_faces', facesDetected: detectedFaces.length };
    }

    const qualityScore = detectedFaces[0].qualityScore || 0.9;

    // --- Stage 3: Generate Face Embedding (FR-SELFIE-004) ---
    const embedding = await faceProvider.generateEmbedding(imageBuffer);
    const vector = embedding.vector;
    const embeddingDimensions = embedding.dimensions;

    logger.info(
      { guestId, dimensions: embeddingDimensions, quality: qualityScore },
      'Face embedding generated'
    );

    // --- Stage 4: Create/Update Reference Face ---
    // FR-PIPE-003: Idempotent — upsert by guestId + eventId
    const referenceFace = await ReferenceFace.findOneAndUpdate(
      { guestId, eventId, deletedAt: null },
      {
        guestId,
        eventId,
        tenantId,
        embedding: vector,
        embeddingDimensions,
        qualityScore,
        provider: faceProvider.getProviderName(),
      },
      { upsert: true, new: true }
    );

    // --- Stage 5: Match against existing FaceDetections in the event ---
    // FR-MATCH-001: Strictly event-scoped
    let matchesCreated = 0;
    const threshold = parseFloat(config.matching?.threshold) || 0.6;

    const faceDetections = await FaceDetection.find({ eventId })
      .select('+embedding')
      .lean();

    for (const fd of faceDetections) {
      if (!fd.embedding || fd.embedding.length === 0) continue;

      const similarity = await faceProvider.compareFaces(vector, fd.embedding);

      // FR-MATCH-002: Only create match if above threshold
      if (similarity >= threshold) {
        try {
          await Match.findOneAndUpdate(
            {
              guestId,
              photoId: fd.photoId,
              faceDetectionId: fd._id,
            },
            {
              guestId,
              photoId: fd.photoId,
              faceDetectionId: fd._id,
              eventId,
              tenantId,
              confidenceScore: similarity,
            },
            { upsert: true, new: true }
          );
          matchesCreated++;

          logger.debug(
            {
              guestId,
              photoId: fd.photoId.toString(),
              confidence: similarity.toFixed(4),
            },
            'Selfie match created'
          );
        } catch (err) {
          // Duplicate key is fine (idempotent) — FR-PIPE-003
          if (err.code !== 11000) throw err;
        }
      }
    }

    // Update event match stats
    if (matchesCreated > 0) {
      await Event.findByIdAndUpdate(eventId, {
        $inc: { 'stats.matchCount': matchesCreated },
      });
    }

    // --- Stage 6: Mark selfie as accepted ---
    await Guest.findByIdAndUpdate(guestId, {
      selfieStatus: 'accepted',
      selfieRejectionReason: null,
    });

    const durationMs = Date.now() - startTime;
    logger.info(
      {
        guestId, eventId, durationMs,
        referenceFaceId: referenceFace._id.toString(),
        matchesCreated,
        totalFacesScanned: faceDetections.length,
      },
      'Selfie processing complete on Railway Worker'
    );

    return {
      guestId,
      status: 'accepted',
      referenceFaceId: referenceFace._id.toString(),
      matchesCreated,
      durationMs,
    };

  } catch (err) {
    const durationMs = Date.now() - startTime;
    logger.error(
      { guestId, eventId, durationMs, err: err.message },
      'Selfie processing failed on Railway Worker'
    );

    // Mark as rejected with error info
    await Guest.findByIdAndUpdate(guestId, {
      selfieStatus: 'rejected',
      selfieRejectionReason: 'An error occurred processing your selfie. Please try again.',
    });

    throw err;
  }
}

module.exports = { processSelfie };
