/**
 * Worker-side PhotoDerivative model — creates derivative records.
 * Matches the server's PhotoDerivative schema.
 */

const mongoose = require('mongoose');
const { DERIVATIVE_TYPE } = require('@photofolio/shared');

const photoDerivativeSchema = new mongoose.Schema(
  {
    photoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Photo', required: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    type: { type: String, enum: Object.values(DERIVATIVE_TYPE), required: true },
    s3Key: { type: String, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    sizeBytes: { type: Number, required: true },
    format: { type: String, default: 'jpeg' },
  },
  { timestamps: true }
);

// Unique: one derivative per photo+type — FR-PIPE-003 idempotency
photoDerivativeSchema.index({ photoId: 1, type: 1 }, { unique: true });

module.exports = mongoose.models.PhotoDerivative || mongoose.model('PhotoDerivative', photoDerivativeSchema);
