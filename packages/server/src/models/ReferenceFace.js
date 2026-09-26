/**
 * ReferenceFace Model — guest selfie face embeddings.
 * PRD Section 10: ReferenceFace entity.
 * FR-SELFIE-004: Reference selfie processed to face embedding.
 * PRIV-003: Soft-deletable for consent withdrawal.
 * SEC-006: Event-scoped, never queryable across events.
 */

const mongoose = require('mongoose');

const referenceFaceSchema = new mongoose.Schema(
  {
    // Guest who submitted the selfie
    guestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Guest',
      required: [true, 'Guest ID is required'],
    },
    // SEC-006: Event-scoped
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: [true, 'Event ID is required'],
    },
    // SEC-001: Tenant-scoped
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant ID is required'],
      index: true,
    },
    // Face embedding vector from guest selfie
    // NFR-PRIV-001: Never exposed via public/unauthenticated API
    embedding: {
      type: [Number],
      required: true,
      select: false,
    },
    embeddingDimensions: {
      type: Number,
      required: true,
    },
    // Face quality score from selfie validation (FR-SELFIE-002)
    qualityScore: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    // S3 key for the reference selfie (private — SEC-003)
    s3Key: {
      type: String,
      default: null,
    },
    // Provider that generated this embedding (GAP-019)
    provider: {
      type: String,
      required: true,
    },
    // PRIV-003: Soft delete for consent withdrawal
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// One active reference face per guest per event
referenceFaceSchema.index(
  { guestId: 1, eventId: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } }
);

// Event-level queries for incremental matching (FR-MATCH-003)
referenceFaceSchema.index({ eventId: 1, deletedAt: 1 });

module.exports = mongoose.model('ReferenceFace', referenceFaceSchema);
