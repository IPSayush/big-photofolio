/**
 * Worker S3 Client — downloads originals, uploads derivatives.
 * SEC-003: Both buckets are private.
 */

const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const config = require('./config');

let s3Client = null;

function getS3Client() {
  if (!s3Client) {
    s3Client = new S3Client({
      region: config.aws.region,
      credentials: {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
      },
    });
  }
  return s3Client;
}

/**
 * Download an object from S3 as a Buffer.
 * @param {string} bucket - S3 bucket name.
 * @param {string} key - S3 object key.
 * @returns {Promise<Buffer>} Object contents.
 */
async function downloadFromS3(bucket, key) {
  const client = getS3Client();
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const response = await client.send(command);

  // Convert readable stream to Buffer
  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Upload a Buffer to S3.
 * @param {string} bucket - S3 bucket name.
 * @param {string} key - S3 object key.
 * @param {Buffer} body - File contents.
 * @param {string} contentType - MIME type.
 * @returns {Promise<void>}
 */
async function uploadToS3(bucket, key, body, contentType) {
  const client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  await client.send(command);
}

/**
 * Build derivative S3 key.
 * Format: tenants/{tenantId}/events/{eventId}/derivatives/{type}/{photoId}.jpeg
 * SEC-001: Tenant-scoped key structure.
 */
function buildDerivativeKey(tenantId, eventId, photoId, type) {
  return `tenants/${tenantId}/events/${eventId}/derivatives/${type}/${photoId}.jpeg`;
}

module.exports = {
  getS3Client,
  downloadFromS3,
  uploadToS3,
  buildDerivativeKey,
};
