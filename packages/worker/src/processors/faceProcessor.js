/**
 * Face Processor — BullMQ job handler for face detection, embedding, and matching.
 * FR-PIPE-002: Face detection → embedding → indexing → matching stages.
 * FR-MATCH-001: Matching strictly scoped to guest's own event (SEC-006).
 * FR-MATCH-003: Incremental matching — new photos matched against existing guest selfies.
 * FR-PIPE-003: Each stage independently retryable and idempotent.
 * NFR-OBS-001: Structured logging for latency and failures.
 */

const sharp = require('sharp');
const pino = require('pino');
const config = require('../config');
const { downloadFromS3 } = require('../s3');
const { getFaceProvider } = require('../providers/providerFactory');
const Photo = require('../models/Photo');
const FaceDetection = require('../models/FaceDetection');
const ReferenceFace = require('../models/ReferenceFace');
const Match = require('../models/Match');
const Event = require('../models/Event');
const { PHOTO_STATUS, DERIVATIVE_TYPE } = require('@photofolio/shared');

const logger = pino({
  level: config.nodeEnv === 'production' ? 'info' : 'debug',
  transport:
    config.nodeEnv !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
      : undefined,
});

/**
 * Process face detection, embedding, and matching for a single photo.
 * Triggered after derivative generation completes.
 *
 * @param {import('bullmq').Job} job - { photoId, tenantId, eventId, s3DerivativeKey }
 */
async function processFaces(job) {
  const { photoId, tenantId, eventId, s3DerivativeKey } = job.data;
  const startTime = Date.now();
  const faceProvider = getFaceProvider();

  logger.info(
    { photoId, tenantId, eventId, provider: faceProvider.getProviderName(), jobId: job.id },
    'Face processing started'
  );

  try {
    // --- Stage 1: Download web-optimized derivative ---
    const imageBuffer = await downloadFromS3(
      config.aws.s3BucketDerivatives,
      s3DerivativeKey
    );
    logger.debug({ photoId, sizeBytes: imageBuffer.length }, 'Derivative downloaded for face detection');

    // --- Stage 2: Face Detection ---
    const detectedFaces = await faceProvider.detectFaces(imageBuffer);
    logger.info(
      { photoId, facesDetected: detectedFaces.length },
      'Faces detected'
    );

    if (detectedFaces.length === 0) {
      // No faces in this photo — mark as processed, skip embedding/matching
      logger.info({ photoId }, 'No faces detected — skipping embedding/matching');
      const durationMs = Date.now() - startTime;
      return { photoId, facesDetected: 0, matchesCreated: 0, durationMs };
    }

    // --- Stage 3: Face Embedding ---
    const metadata = await sharp(imageBuffer).metadata();
    const faceDetections = [];

    for (const face of detectedFaces) {
      // Crop the face region from the image
      const cropRegion = {
        left: Math.round(face.boundingBox.x * metadata.width),
        top: Math.round(face.boundingBox.y * metadata.height),
        width: Math.round(face.boundingBox.width * metadata.width),
        height: Math.round(face.boundingBox.height * metadata.height),
      };

      // Ensure crop is within bounds
      cropRegion.left = Math.max(0, cropRegion.left);
      cropRegion.top = Math.max(0, cropRegion.top);
      cropRegion.width = Math.min(cropRegion.width, metadata.width - cropRegion.left);
      cropRegion.height = Math.min(cropRegion.height, metadata.height - cropRegion.top);

      // Guard against zero-dimension crops
      if (cropRegion.width < 10 || cropRegion.height < 10) {
        logger.warn({ photoId, cropRegion }, 'Face crop too small — skipping');
        continue;
      }

      const faceBuffer = await sharp(imageBuffer)
        .extract(cropRegion)
        .jpeg({ quality: 90 })
        .toBuffer();

      const embedding = await faceProvider.generateEmbedding(faceBuffer);

      // FR-PIPE-003: Idempotent — upsert by { photoId, boundingBox }
      const faceDetection = await FaceDetection.findOneAndUpdate(
        {
          photoId,
          'boundingBox.x': face.boundingBox.x,
          'boundingBox.y': face.boundingBox.y,
        },
        {
          photoId,
          eventId,
          tenantId,
          boundingBox: face.boundingBox,
          confidence: face.confidence,
          qualityScore: face.qualityScore,
          embedding: embedding.vector,
          embeddingDimensions: embedding.dimensions,
          provider: faceProvider.getProviderName(),
        },
        { upsert: true, new: true }
      );

      faceDetections.push(faceDetection);
      logger.debug(
        { photoId, faceId: faceDetection._id, dimensions: embedding.dimensions },
        'Face embedded'
      );
    }

    // --- Stage 4: Incremental Matching (FR-MATCH-003) ---
    // Match newly detected faces against existing guest reference faces in the same event
    let matchesCreated = 0;
    const threshold = parseFloat(config.matching?.threshold) || 0.6;

    const referenceFaces = await ReferenceFace.find({
      eventId,
      deletedAt: null,
    }).select('+embedding');

    if (referenceFaces.length > 0) {
      for (const faceDetection of faceDetections) {
        // Get the embedding (it was just created, need to fetch with select)
        const fdWithEmbedding = await FaceDetection.findById(faceDetection._id).select('+embedding');
        if (!fdWithEmbedding || !fdWithEmbedding.embedding) continue;

        for (const refFace of referenceFaces) {
          if (!refFace.embedding) continue;

          const similarity = await faceProvider.compareFaces(
            fdWithEmbedding.embedding,
            refFace.embedding
          );

          // FR-MATCH-002: Only create match if above threshold
          if (similarity >= threshold) {
            try {
              await Match.findOneAndUpdate(
                {
                  guestId: refFace.guestId,
                  photoId,
                  faceDetectionId: faceDetection._id,
                },
                {
                  guestId: refFace.guestId,
                  photoId,
                  faceDetectionId: faceDetection._id,
                  eventId,
                  tenantId,
                  confidenceScore: similarity,
                },
                { upsert: true, new: true }
              );
              matchesCreated++;

              logger.debug(
                {
                  photoId,
                  guestId: refFace.guestId.toString(),
                  confidence: similarity.toFixed(4),
                },
                'Match created'
              );
            } catch (err) {
              // Duplicate key is fine (idempotent) — FR-PIPE-003
              if (err.code !== 11000) throw err;
            }
          }
        }
      }

      // Update event match stats
      if (matchesCreated > 0) {
        await Event.findByIdAndUpdate(eventId, {
          $inc: { 'stats.matchCount': matchesCreated },
        });
      }
    }

    const durationMs = Date.now() - startTime;
    logger.info(
      {
        photoId, tenantId, eventId, durationMs,
        facesDetected: faceDetections.length,
        matchesCreated,
      },
      'Face processing complete'
    );

    return { photoId, facesDetected: faceDetections.length, matchesCreated, durationMs };

  } catch (err) {
    const durationMs = Date.now() - startTime;
    logger.error(
      { photoId, tenantId, eventId, durationMs, err: err.message },
      'Face processing failed'
    );

    // Update photo with failure info (but don't reset to failed —
    // derivatives are already generated, only face stage failed)
    await Photo.findByIdAndUpdate(photoId, {
      $set: { failureReason: `Face processing: ${err.message}` },
    });

    throw err;
  }
}

module.exports = { processFaces };
