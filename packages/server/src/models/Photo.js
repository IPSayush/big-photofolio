/**
 * Photo Model — uploaded event photos with processing status tracking.
 * FR-UPLOAD-001: Bulk upload event photos.
 * FR-UPLOAD-005: Duplicate detection via hash.
 * FR-PIPE-002: Processing pipeline status tracking.
 *
 * SEC-001/SEC-002: tenant_id and event_id present, enforced via
 * tenantScope middleware + data-layer filtering in upload.service.js.
 * SEC-003: s3OriginalKey points to a private bucket — never a public URL.
 */

const mongoose = require('mongoose');
const { PHOTO_STATUS } = require('@photofolio/shared');

const photoSchema = new mongoose.Schema(
  {
    // SEC-001: Tenant-scoped
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant ID is required'],
    },
    // Photo belongs to a specific event
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: [true, 'Event ID is required'],
    },
    // SEC-003: S3 key in private bucket — never a public URL
    s3OriginalKey: {
      type: String,
      required: [true, 'S3 key is required'],
    },
    // FR-PIPE-002: Pipeline status tracking
    status: {
      type: String,
      enum: Object.values(PHOTO_STATUS),
      default: PHOTO_STATUS.UPLOADED,
      index: true,
    },
    // Original file metadata
    originalFileName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    contentType: {
      type: String,
      required: true,
      trim: true,
    },
    sizeBytes: {
      type: Number,
      required: true,
      min: 0,
    },
    // FR-UPLOAD-005: SHA-256 hash for duplicate detection
    hash: {
      type: String,
      required: [true, 'File hash is required for duplicate detection'],
    },
    // FR-UPLOAD-003: Batch tracking for resumable uploads
    uploadBatchId: {
      type: String,
      required: true,
    },
    // FR-UPLOAD-003: Tracks whether client confirmed the S3 upload completed
    uploadConfirmed: {
      type: Boolean,
      default: false,
    },
    // FR-PIPE-004: Failure reason for retry UI
    failureReason: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound index for tenant+event scoped queries with status filtering
photoSchema.index({ tenantId: 1, eventId: 1, status: 1 });

// FR-UPLOAD-005: Duplicate detection within an event
photoSchema.index({ eventId: 1, hash: 1 });

// Batch-level queries for upload resumability (FR-UPLOAD-003)
photoSchema.index({ uploadBatchId: 1, uploadConfirmed: 1 });

module.exports = mongoose.models.Photo || mongoose.model('Photo', photoSchema);
