/**
 * Match Model — face matching results linking guests to photos.
 * PRD Section 10: Match entity.
 * FR-MATCH-001: Matching strictly scoped to guest's own event.
 * FR-MATCH-005: Confidence scores logged for support/quality review.
 */

const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema(
  {
    // Guest who was matched
    guestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Guest',
      required: [true, 'Guest ID is required'],
      index: true,
    },
    // Photo containing the matched face
    photoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Photo',
      required: [true, 'Photo ID is required'],
      index: true,
    },
    // Which specific face detection was matched
    faceDetectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FaceDetection',
      required: [true, 'FaceDetection ID is required'],
    },
    // SEC-006 / FR-MATCH-001: Event-scoped
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: [true, 'Event ID is required'],
      index: true,
    },
    // SEC-001: Tenant-scoped
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant ID is required'],
      index: true,
    },
    // FR-MATCH-005: Confidence score for support/quality review
    confidenceScore: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// No duplicate matches — one match per guest+photo+face combination
matchSchema.index(
  { guestId: 1, photoId: 1, faceDetectionId: 1 },
  { unique: true }
);

// Guest gallery query — all matches for a guest in an event
matchSchema.index({ guestId: 1, eventId: 1, confidenceScore: -1 });

// Event-level match stats for photographer dashboard
matchSchema.index({ eventId: 1 });

module.exports = mongoose.model('Match', matchSchema);
