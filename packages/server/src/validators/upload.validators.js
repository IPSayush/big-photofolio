/**
 * Upload Validation Schemas (Zod).
 * SEC-002: All upload inputs validated server-side.
 *
 * FR-UPLOAD-002: Pre-signed URL request validation.
 * FR-UPLOAD-005: Hash required for duplicate detection.
 */

const { z } = require('zod');
const { PHOTO_STATUS } = require('@photofolio/shared');

/** FR-UPLOAD-002: Request pre-signed upload URLs */
const requestUploadUrlsSchema = z.object({
  files: z
    .array(
      z.object({
        fileName: z
          .string({ required_error: 'File name is required' })
          .trim()
          .min(1, 'File name is required')
          .max(500, 'File name cannot exceed 500 characters'),
        contentType: z
          .string({ required_error: 'Content type is required' })
          .trim()
          .min(1, 'Content type is required'),
        sizeBytes: z
          .number({ required_error: 'File size is required' })
          .int('File size must be an integer')
          .positive('File size must be positive'),
        hash: z
          .string({ required_error: 'File hash is required for duplicate detection (FR-UPLOAD-005)' })
          .length(64, 'Hash must be a 64-character SHA-256 hex string')
          .regex(/^[0-9a-f]{64}$/, 'Hash must be a valid lowercase SHA-256 hex string'),
      })
    )
    .min(1, 'At least one file is required')
    .max(200, 'Maximum 200 files per batch request'),
});

/** FR-UPLOAD-003: Confirm upload completion */
const confirmUploadSchema = z.object({
  photoIds: z
    .array(
      z.string().min(1, 'Photo ID is required')
    )
    .min(1, 'At least one photo ID is required')
    .max(200, 'Maximum 200 confirmations per request'),
});

/** List photos query params */
const listPhotosQuerySchema = z.object({
  status: z
    .enum(Object.values(PHOTO_STATUS))
    .optional(),
  page: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1))
    .optional()
    .default('1'),
  limit: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(100))
    .optional()
    .default('50'),
});

module.exports = {
  requestUploadUrlsSchema,
  confirmUploadSchema,
  listPhotosQuerySchema,
};
