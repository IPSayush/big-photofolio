/**
 * Worker Configuration — environment settings for the BullMQ worker.
 * Reads from the same .env as the API server.
 *
 * NFR-MAINT-001: All processing settings are configurable via env.
 */

const config = Object.freeze({
  nodeEnv: process.env.NODE_ENV || 'development',

  // MongoDB — same Atlas instance as the API server
  mongodbUri: process.env.MONGODB_URI,

  // Redis — BullMQ queue backend
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  // AWS S3
  aws: {
    region: process.env.AWS_REGION || 'ap-south-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    s3BucketOriginals: process.env.S3_BUCKET_ORIGINALS,
    s3BucketDerivatives: process.env.S3_BUCKET_DERIVATIVES,
  },

  // Image processing settings — NFR-MAINT-001: configurable, not hardcoded
  processing: {
    thumbnail: {
      width: parseInt(process.env.DERIVATIVE_THUMBNAIL_WIDTH, 10) || 300,
      quality: parseInt(process.env.DERIVATIVE_THUMBNAIL_QUALITY, 10) || 80,
    },
    web: {
      maxWidth: parseInt(process.env.DERIVATIVE_WEB_MAX_WIDTH, 10) || 1920,
      quality: parseInt(process.env.DERIVATIVE_WEB_QUALITY, 10) || 85,
    },
    watermark: {
      enabled: process.env.DERIVATIVE_WATERMARK_ENABLED !== 'false',
      text: process.env.DERIVATIVE_WATERMARK_TEXT || 'PhotoFolio',
      opacity: parseFloat(process.env.DERIVATIVE_WATERMARK_OPACITY) || 0.3,
      fontSize: parseInt(process.env.DERIVATIVE_WATERMARK_FONT_SIZE, 10) || 48,
    },
  },

  // Face matching settings — FR-MATCH-002: configurable threshold
  matching: {
    threshold: parseFloat(process.env.FACE_MATCH_THRESHOLD) || 0.6,
    provider: process.env.FACE_PROVIDER || 'mock',
  },

  // Worker concurrency
  concurrency: parseInt(process.env.WORKER_CONCURRENCY, 10) || 3,
});

module.exports = config;
