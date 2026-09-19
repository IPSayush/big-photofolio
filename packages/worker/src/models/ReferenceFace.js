/**
 * Worker-side ReferenceFace model — reads guest reference faces for matching.
 */

const mongoose = require('mongoose');

const referenceFaceSchema = new mongoose.Schema(
  {
    guestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Guest', required: true },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    embedding: { type: [Number], required: true, select: false },
    embeddingDimensions: { type: Number, required: true },
    qualityScore: { type: Number, required: true },
    provider: { type: String, required: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

referenceFaceSchema.index({ eventId: 1, deletedAt: 1 });

module.exports = mongoose.model('ReferenceFace', referenceFaceSchema);
