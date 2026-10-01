/**
 * Image Processor â€” BullMQ job handler for derivative generation.
 * FR-PIPE-002: Pipeline stages: validation â†’ derivative generation â†’ status update.
 * FR-PIPE-003: Each stage is independently retryable and idempotent.
 * FR-PIPE-004: Failures flagged with reason.
 * NFR-OBS-001: Structured logging for latency and failures.
 */

const sharp = require('sharp');
const pino = require('pino');
const mongoose = require('mongoose');
const config = require('../config');
const { downloadFromS3, uploadToS3, buildDerivativeKey } = require('../s3');
const Photo = require('../models/Photo');
const PhotoDerivative = require('../models/PhotoDerivative');
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
 * Process a single photo: validate, generate derivatives, update status.
 * FR-PIPE-002: Full pipeline for derivative generation stage.
 *
 * @param {import('bullmq').Job} job - BullMQ job with { photoId, tenantId, eventId, s3OriginalKey }.
 */
async function processImage(job) {
  const { photoId, tenantId, eventId, s3OriginalKey } = job.data;
  const startTime = Date.now();

  logger.info({ photoId, tenantId, eventId, jobId: job.id }, 'Processing started');

  try {
    // --- Stage 1: Ingest Validation ---
    await updatePhotoStatus(photoId, PHOTO_STATUS.VALIDATING);

    const originalBuffer = await downloadFromS3(config.aws.s3BucketOriginals, s3OriginalKey);
    logger.debug({ photoId, sizeBytes: originalBuffer.length }, 'Original downloaded from S3');

    // Validate it's a real image by reading metadata via Sharp
    let metadata;
    try {
      metadata = await sharp(originalBuffer).metadata();
    } catch (err) {
      throw new ProcessingError('File is not a valid image or is corrupted.', err);
    }

    if (!metadata.width || !metadata.height) {
      throw new ProcessingError('Image has no valid dimensions.');
    }

    logger.debug(
      { photoId, format: metadata.format, width: metadata.width, height: metadata.height },
      'Image validated'
    );

    // --- Stage 2: Derivative Generation ---
    await updatePhotoStatus(photoId, PHOTO_STATUS.PROCESSING);

    // Generate all derivative types
    const derivatives = await generateDerivatives(
      originalBuffer, metadata, photoId, tenantId, eventId
    );

    // --- Stage 3: Upload Derivatives to S3 ---
    for (const derivative of derivatives) {
      await uploadToS3(
        config.aws.s3BucketDerivatives,
        derivative.s3Key,
        derivative.buffer,
        'image/jpeg'
      );
      logger.debug({ photoId, type: derivative.type, s3Key: derivative.s3Key }, 'Derivative uploaded');
    }

    // --- Stage 4: Create/Update PhotoDerivative records ---
    // FR-PIPE-003: Idempotent â€” upsert by { photoId, type }
    for (const derivative of derivatives) {
      const derivResult = await PhotoDerivative.findOneAndUpdate(
        { photoId, type: derivative.type },
        {
          photoId,
          tenantId,
          eventId,
          type: derivative.type,
          s3Key: derivative.s3Key,
          width: derivative.width,
          height: derivative.height,
          sizeBytes: derivative.sizeBytes,
          format: 'jpeg',
        },
        { upsert: true, new: true }
      );
      logger.info({ photoId, derivativeType: derivative.type, derivId: derivResult?._id?.toString(), upserted: !!derivResult }, 'DEBUG: PhotoDerivative upsert result');
    }

    // --- Stage 5: Mark as processed (derivatives done) ---
    await updatePhotoStatus(photoId, PHOTO_STATUS.PROCESSED);
    await Event.findByIdAndUpdate(eventId, {
      $inc: { 'stats.processedPhotoCount': 1 },
    });

    // --- Stage 6: Enqueue face processing (FR-PIPE-002 next stage) ---
    // Find the web-optimized derivative key for face detection input
    const webDerivative = derivatives.find(
      (d) => d.type === DERIVATIVE_TYPE.WEB_OPTIMIZED
    );
    if (webDerivative && job.queue) {
      // Enqueue on the face-processing queue via the same Redis connection
      const { Queue } = require('bullmq');
      const faceQueue = new Queue('face-processing', {
        connection: job.queue?.opts?.connection || {
          host: 'localhost',
          port: 6379,
        },
      });

      await faceQueue.add('process-faces', {
        photoId: photoId.toString(),
        tenantId: tenantId.toString(),
        eventId: eventId.toString(),
        s3DerivativeKey: webDerivative.s3Key,
      }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      });

      await faceQueue.close();
      logger.info({ photoId }, 'Face processing job enqueued');
    }

    const durationMs = Date.now() - startTime;
    logger.info(
      { photoId, tenantId, eventId, durationMs, derivatives: derivatives.length },
      'Derivative processing complete'
    );

    return { photoId, derivatives: derivatives.length, durationMs };

  } catch (err) {
    // FR-PIPE-004: Flag with reason
    const reason = err instanceof ProcessingError
      ? err.message
      : `Unexpected error: ${err.message}`;

    await Photo.findByIdAndUpdate(photoId, {
      status: PHOTO_STATUS.FAILED,
      failureReason: reason,
    });

    await Event.findByIdAndUpdate(eventId, {
      $inc: { 'stats.failedPhotoCount': 1 },
    });

    const durationMs = Date.now() - startTime;
    logger.error(
      { photoId, tenantId, eventId, durationMs, err: err.message },
      'Processing failed'
    );

    // Rethrow so BullMQ can retry (FR-PIPE-003)
    throw err;
  }
}

/**
 * Generate all derivative images using Sharp.
 * FR-PIPE-002: thumbnail, web-optimized, watermarked.
 *
 * @param {Buffer} originalBuffer - Original image data.
 * @param {object} metadata - Sharp metadata of the original.
 * @param {string} photoId - Photo ID.
 * @param {string} tenantId - Tenant ID.
 * @param {string} eventId - Event ID.
 * @returns {Promise<Array>} Array of { type, buffer, s3Key, width, height, sizeBytes }.
 */
async function generateDerivatives(originalBuffer, metadata, photoId, tenantId, eventId) {
  const derivatives = [];
  const { thumbnail: thumbCfg, web: webCfg, watermark: wmCfg } = config.processing;

  // --- Thumbnail ---
  const thumbResult = await sharp(originalBuffer)
    .resize(thumbCfg.width, null, { withoutEnlargement: true })
    .jpeg({ quality: thumbCfg.quality })
    .toBuffer({ resolveWithObject: true });

  derivatives.push({
    type: DERIVATIVE_TYPE.THUMBNAIL,
    buffer: thumbResult.data,
    s3Key: buildDerivativeKey(tenantId, eventId, photoId, DERIVATIVE_TYPE.THUMBNAIL),
    width: thumbResult.info.width,
    height: thumbResult.info.height,
    sizeBytes: thumbResult.data.length,
  });

  // --- Web-optimized ---
  const webResult = await sharp(originalBuffer)
    .resize(webCfg.maxWidth, null, { withoutEnlargement: true })
    .jpeg({ quality: webCfg.quality })
    .toBuffer({ resolveWithObject: true });

  derivatives.push({
    type: DERIVATIVE_TYPE.WEB_OPTIMIZED,
    buffer: webResult.data,
    s3Key: buildDerivativeKey(tenantId, eventId, photoId, DERIVATIVE_TYPE.WEB_OPTIMIZED),
    width: webResult.info.width,
    height: webResult.info.height,
    sizeBytes: webResult.data.length,
  });

  // --- Watermarked ---
  if (wmCfg.enabled) {
    const watermarkedBuffer = await applyWatermark(
      webResult.data, webResult.info.width, webResult.info.height, wmCfg
    );
    const wmMeta = await sharp(watermarkedBuffer).metadata();

    derivatives.push({
      type: DERIVATIVE_TYPE.WATERMARKED,
      buffer: watermarkedBuffer,
      s3Key: buildDerivativeKey(tenantId, eventId, photoId, DERIVATIVE_TYPE.WATERMARKED),
      width: wmMeta.width,
      height: wmMeta.height,
      sizeBytes: watermarkedBuffer.length,
    });
  }

  return derivatives;
}

/**
 * Apply a text watermark overlay to an image.
 * Uses SVG text overlay via Sharp composite.
 *
 * @param {Buffer} imageBuffer - Source image buffer (web-optimized).
 * @param {number} width - Image width.
 * @param {number} height - Image height.
 * @param {object} wmCfg - Watermark config { text, opacity, fontSize }.
 * @returns {Promise<Buffer>} Watermarked image buffer.
 */
async function applyWatermark(imageBuffer, width, height, wmCfg) {
  // Create diagonal text watermark via SVG
  const svgWatermark = `
    <svg width="${width}" height="${height}">
      <defs>
        <pattern id="wm" patternUnits="userSpaceOnUse" width="400" height="300"
                 patternTransform="rotate(-30)">
          <text x="10" y="150" font-family="Arial, sans-serif" font-size="${wmCfg.fontSize}"
                fill="white" fill-opacity="${wmCfg.opacity}">${wmCfg.text}</text>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#wm)" />
    </svg>
  `;

  return sharp(imageBuffer)
    .composite([{
      input: Buffer.from(svgWatermark),
      top: 0,
      left: 0,
    }])
    .jpeg({ quality: 85 })
    .toBuffer();
}

/**
 * Update photo status. Idempotent â€” FR-PIPE-003.
 */
async function updatePhotoStatus(photoId, status) {
  // DEBUG: Log mongoose connection state and photoId details
  const connState = mongoose.connection.readyState;
  const connStateNames = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  logger.info({
    photoId,
    photoIdType: typeof photoId,
    status,
    mongooseState: connStateNames[connState] || connState,
    dbName: mongoose.connection.db ? mongoose.connection.db.databaseName : 'NO_DB',
  }, 'DEBUG: updatePhotoStatus called');

  try {
    const result = await Photo.findByIdAndUpdate(photoId, { status, failureReason: null }, { new: true });
    if (result) {
      logger.info({ photoId, newStatus: result.status, docId: result._id.toString() }, 'DEBUG: Photo status updated successfully');
    } else {
      logger.error({ photoId, status }, 'DEBUG: Photo.findByIdAndUpdate returned NULL - document not found!');
      
      // Extra debug: try to find the photo directly
      const exists = await Photo.findById(photoId);
      logger.error({
        photoId,
        existsById: !!exists,
        existsStatus: exists ? exists.status : 'N/A',
      }, 'DEBUG: Photo existence check');
      
      // Count total photos in collection
      const totalPhotos = await Photo.countDocuments({});
      logger.error({ totalPhotos }, 'DEBUG: Total photos in worker DB');
    }
  } catch (err) {
    logger.error({ photoId, status, error: err.message, stack: err.stack }, 'DEBUG: updatePhotoStatus THREW error');
  }
}

/**
 * Custom error class for expected processing failures.
 */
class ProcessingError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'ProcessingError';
    this.cause = cause;
  }
}

module.exports = { processImage, generateDerivatives, applyWatermark, ProcessingError };

