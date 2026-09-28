/**
 * Worker-side FaceDetection model — creates face detection records.
 */

const mongoose = require('mongoose');

const faceDetectionSchema = new mongoose.Schema(
  {
    photoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Photo', required: true },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    boundingBox: {
      x: { type: Number, required: true },
      y: { type: Number, required: true },
      width: { type: Number, required: true },
      height: { type: Number, required: true },
    },
    confidence: { type: Number, required: true },
    qualityScore: { type: Number, required: true },
    embedding: { type: [Number], required: true, select: false },
    embeddingDimensions: { type: Number, required: true },
    provider: { type: String, required: true },
  },
  { timestamps: true }
);

faceDetectionSchema.index({ eventId: 1, photoId: 1 });

module.exports = mongoose.models.FaceDetection || mongoose.model('FaceDetection', faceDetectionSchema);
