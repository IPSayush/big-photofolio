/**
 * Environment configuration loader with validation.
 * NFR-MAINT-001: No hardcoded values — everything from env vars.
 * 
 * Validates that required env vars are present at startup.
 * Provides typed, centralized access to all configuration.
 */

const dotenv = require('dotenv');
const path = require('path');

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const requiredVars = [
  'MONGODB_URI',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
];

/**
 * Validate that all required environment variables are set.
 * Fails fast at startup if any are missing.
 */
function validateEnv() {
  const missing = requiredVars.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
      `Copy .env.example to .env and fill in the values.`
    );
  }
}

// Only validate in non-test environments
if (process.env.NODE_ENV !== 'test') {
  validateEnv();
}

const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,

  // MongoDB
  mongodbUri: process.env.MONGODB_URI,

  // Redis
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  // JWT — FR-AUTH-005: short-lived access tokens with refresh support
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  // AWS S3 — SEC-003: private buckets
  aws: {
    region: process.env.AWS_REGION || 'ap-south-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    s3BucketOriginals: process.env.S3_BUCKET_ORIGINALS || 'photofolio-originals',
    s3BucketDerivatives: process.env.S3_BUCKET_DERIVATIVES || 'photofolio-derivatives',
  },

  // CloudFront — SEC-004/005: signed URLs
  cloudfront: {
    domain: process.env.CLOUDFRONT_DOMAIN,
    keyPairId: process.env.CLOUDFRONT_KEY_PAIR_ID,
    privateKeyPath: process.env.CLOUDFRONT_PRIVATE_KEY_PATH,
  },

  // Razorpay — FR-PLAN-005
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  },

  // Email — GAP-010
  email: {
    provider: process.env.EMAIL_PROVIDER || 'ses',
    smtpHost: process.env.SMTP_HOST,
    smtpPort: parseInt(process.env.SMTP_PORT, 10) || 587,
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    from: process.env.EMAIL_FROM || 'noreply@photofolio.app',
  },

  // App URLs
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  apiUrl: process.env.API_URL || 'http://localhost:5000',

  // Rate Limiting — SEC-008
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  },

  // Upload — FR-UPLOAD-002/004, NFR-MAINT-001: all limits configurable
  upload: {
    maxFileSizeBytes: parseInt(process.env.MAX_FILE_SIZE_BYTES, 10) || 50 * 1024 * 1024, // 50 MB
    allowedMimeTypes: (process.env.ALLOWED_MIME_TYPES || 'image/jpeg,image/png,image/heic,image/heif').split(','),
    presignedUrlExpiresIn: parseInt(process.env.PRESIGNED_URL_EXPIRES_IN, 10) || 900, // 15 minutes
    maxBatchSize: parseInt(process.env.MAX_UPLOAD_BATCH_SIZE, 10) || 100, // files per request
  },
});

module.exports = env;
