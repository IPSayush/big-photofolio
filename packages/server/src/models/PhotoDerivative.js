/**
 * PhotoDerivative Model — generated image variants for delivery.
 * PRD Section 10 (Data Model): PhotoDerivative entity.
 * FR-PIPE-002: Derivatives: thumbnail, web-optimized, watermarked.
 * SEC-003: s3Key points to private derivatives bucket.
 */

const mongoose = require('mongoose');
const { DERIVATIVE_TYPE } = require('@photofolio/shared');

const photoDerivativeSchema = new mongoose.Schema(
  {
    // Parent photo reference
    photoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Photo',
      required: [true, 'Photo ID is required'],
      index: true,
    },
    // SEC-001: Tenant-scoped
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant ID is required'],
      index: true,
    },
    // Event reference for fast event-level queries
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: [true, 'Event ID is required'],
      index: true,
    },
    // FR-PIPE-002: Derivative type
    type: {
      type: String,
      enum: Object.values(DERIVATIVE_TYPE),
      required: [true, 'Derivative type is required'],
    },
    // SEC-003: S3 key in private derivatives bucket
    s3Key: {
      type: String,
      required: [true, 'S3 key is required'],
    },
    // Derivative metadata
    width: {
      type: Number,
      required: true,
      min: 1,
    },
    height: {
      type: Number,
      required: true,
      min: 1,
    },
    sizeBytes: {
      type: Number,
      required: true,
      min: 0,
    },
    format: {
      type: String,
      default: 'jpeg',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Unique constraint: one derivative per photo+type — FR-PIPE-003 idempotency
photoDerivativeSchema.index({ photoId: 1, type: 1 }, { unique: true });

// Event-level derivative queries
photoDerivativeSchema.index({ eventId: 1, type: 1 });

module.exports = mongoose.model('PhotoDerivative', photoDerivativeSchema);
