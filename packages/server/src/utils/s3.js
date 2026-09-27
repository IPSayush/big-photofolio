/**
 * S3 Utility — AWS S3 client and pre-signed URL generation.
 * FR-UPLOAD-002: Uploads go directly to S3 via pre-signed URLs.
 * SEC-003: All media stored in private S3 buckets.
 * SEC-004/005: No permanent public URLs — only short-lived signed URLs.
 *
 * In test mode, returns mock URLs to avoid AWS dependency in CI.
 */

const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const env = require('../config/env');

let s3Client = null;

/**
 * Get or create the singleton S3 client.
 * Returns null in test mode (no real AWS calls).
 */
function getS3Client() {
  if (env.nodeEnv === 'test') {
    return null;
  }
  if (!s3Client) {
    s3Client = new S3Client({
      region: env.aws.region,
      credentials: {
        accessKeyId: env.aws.accessKeyId,
        secretAccessKey: env.aws.secretAccessKey,
      },
    });
  }
  return s3Client;
}

/**
 * Generate a pre-signed PUT URL for direct client upload to S3.
 * FR-UPLOAD-002: Client uploads directly, no proxying through app server.
 * SEC-003: Bucket is private — only pre-signed URLs grant access.
 *
 * @param {string} bucket - S3 bucket name.
 * @param {string} key - S3 object key.
 * @param {string} contentType - MIME type of the file.
 * @param {number} [expiresIn] - URL validity in seconds (default from config).
 * @returns {Promise<string>} Pre-signed PUT URL.
 */
async function generatePresignedPutUrl(bucket, key, contentType, expiresIn) {
  const ttl = expiresIn || env.upload.presignedUrlExpiresIn;

  // In test mode, return a mock URL — no real AWS calls
  if (env.nodeEnv === 'test') {
    return `https://${bucket}.s3.${env.aws.region}.amazonaws.com/${key}?X-Amz-Mock=test&expires=${ttl}`;
  }

  const client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(client, command, { expiresIn: ttl });
}

/**
 * Build the S3 object key for an original photo upload.
 * Tenant-scoped key structure provides defense-in-depth isolation (SEC-001).
 *
 * Format: tenants/{tenantId}/events/{eventId}/originals/{photoId}_{sanitizedFilename}
 *
 * @param {string} tenantId - Tenant ID.
 * @param {string} eventId - Event ID.
 * @param {string} photoId - Photo ID (MongoDB ObjectId).
 * @param {string} originalFileName - Original filename from the client.
 * @returns {string} S3 key.
 */
function buildOriginalPhotoKey(tenantId, eventId, photoId, originalFileName) {
  // Sanitize filename: keep only alphanumeric, dots, hyphens, underscores
  const sanitized = originalFileName
    .replace(/[^a-zA-Z0-9.\-_]/g, '_')
    .substring(0, 200); // Limit length
  return `tenants/${tenantId}/events/${eventId}/originals/${photoId}_${sanitized}`;
}

/**
 * Generate a pre-signed GET URL for secure media delivery.
 * SEC-004: Short-lived signed URLs for gallery images.
 * SEC-005: No permanent public S3 URLs.
 *
 * @param {string} bucket - S3 bucket name.
 * @param {string} key - S3 object key.
 * @param {number} [expiresIn=300] - URL validity in seconds (default 5 min).
 * @returns {Promise<string>} Pre-signed GET URL.
 */
async function generatePresignedGetUrl(bucket, key, expiresIn = 300) {
  // In test mode, return a mock URL — no real AWS calls
  if (env.nodeEnv === 'test') {
    return `https://${bucket}.s3.${env.aws.region}.amazonaws.com/${key}?X-Amz-Mock=test&expires=${expiresIn}`;
  }

  const client = getS3Client();
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  return getSignedUrl(client, command, { expiresIn });
}

/**
 * Batch delete S3 objects by key.
 * FR-EVENT-007: Cascade delete event media from S3.
 * Uses DeleteObjects API (max 1000 keys per call).
 *
 * @param {string} bucket - S3 bucket name.
 * @param {string[]} keys - Array of S3 object keys to delete.
 * @returns {Promise<number>} Number of objects deleted.
 */
async function batchDeleteObjects(bucket, keys) {
  if (!keys || keys.length === 0) return 0;

  if (env.nodeEnv === 'test') {
    return keys.length; // Mock in test mode
  }

  const client = getS3Client();
  let totalDeleted = 0;

  // S3 DeleteObjects supports max 1000 keys per call
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    const command = new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: batch.map((key) => ({ Key: key })),
        Quiet: true,
      },
    });

    await client.send(command);
    totalDeleted += batch.length;
  }

  return totalDeleted;
}

/**
 * List all S3 objects under a prefix.
 * FR-EVENT-007: Find all objects for an event to delete.
 *
 * @param {string} bucket - S3 bucket name.
 * @param {string} prefix - S3 key prefix.
 * @returns {Promise<string[]>} Array of S3 keys.
 */
async function listObjectsByPrefix(bucket, prefix) {
  if (env.nodeEnv === 'test') return [];

  const client = getS3Client();
  const keys = [];
  let continuationToken;

  do {
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    });

    const response = await client.send(command);
    if (response.Contents) {
      keys.push(...response.Contents.map((obj) => obj.Key));
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

module.exports = {
  getS3Client,
  generatePresignedPutUrl,
  generatePresignedGetUrl,
  buildOriginalPhotoKey,
  batchDeleteObjects,
  listObjectsByPrefix,
};
