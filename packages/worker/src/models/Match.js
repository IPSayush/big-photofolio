/**
 * Worker-side Match model — creates match records.
 */

const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema(
  {
    guestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Guest', required: true },
    photoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Photo', required: true },
    faceDetectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'FaceDetection', required: true },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    confidenceScore: { type: Number, required: true, min: 0, max: 1 },
  },
  { timestamps: true }
);

matchSchema.index({ guestId: 1, photoId: 1, faceDetectionId: 1 }, { unique: true });

module.exports = mongoose.model('Match', matchSchema);
