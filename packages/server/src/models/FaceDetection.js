/**
 * FaceDetection Model — detected faces in event photos.
 * PRD Section 10: FaceDetection entity.
 * FR-PIPE-002: Face detection stage of the processing pipeline.
 * SEC-006: Event-scoped, never queryable across events/tenants.
 *
 * The `embedding` field is indexed by MongoDB Atlas Vector Search
 * for cosine similarity matching (FR-MATCH-002).
 */

const mongoose = require('mongoose');

const faceDetectionSchema = new mongoose.Schema(
  {
    // Parent photo
    photoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Photo',
      required: [true, 'Photo ID is required'],
      index: true,
    },
    // SEC-006: Event-scoped — all queries MUST filter by eventId
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
    },
    // Bounding box — normalized 0-1 coordinates
    boundingBox: {
      x: { type: Number, required: true, min: 0, max: 1 },
      y: { type: Number, required: true, min: 0, max: 1 },
      width: { type: Number, required: true, min: 0, max: 1 },
      height: { type: Number, required: true, min: 0, max: 1 },
    },
    // Detection confidence 0-1
    confidence: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    // Face quality score 0-1 (for filtering low-quality detections)
    qualityScore: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    // Face embedding vector — used for Atlas Vector Search matching
    // NFR-PRIV-001: Never exposed via public/unauthenticated API
    embedding: {
      type: [Number],
      required: true,
      select: false, // Never returned by default — must be explicitly requested
    },
    // Embedding dimensions (provider-dependent: 128 mock, 512+ real)
    embeddingDimensions: {
      type: Number,
      required: true,
    },
    // Provider that generated this detection (GAP-019 traceability)
    provider: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// SEC-006: Event-scoped face queries — primary access pattern
faceDetectionSchema.index({ eventId: 1, photoId: 1 });

// Tenant-scoped cleanup/admin queries
faceDetectionSchema.index({ tenantId: 1, eventId: 1 });

/**
 * Atlas Vector Search index definition (create on Atlas console/API):
 *
 * {
 *   "name": "face_embedding_index",
 *   "type": "vectorSearch",
 *   "definition": {
 *     "fields": [{
 *       "type": "vector",
 *       "path": "embedding",
 *       "numDimensions": 128,   // Adjust per provider
 *       "similarity": "cosine"
 *     }, {
 *       "type": "filter",
 *       "path": "eventId"       // SEC-006: event-scoped search
 *     }]
 *   }
 * }
 */

module.exports = mongoose.models.FaceDetection || mongoose.model('FaceDetection', faceDetectionSchema);
