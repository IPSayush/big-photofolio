/**
 * Worker-side Photo model — minimal copy for status updates.
 * Matches the server's Photo schema to share the same MongoDB collection.
 */

const mongoose = require('mongoose');
const { PHOTO_STATUS } = require('@photofolio/shared');

const photoSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    s3OriginalKey: { type: String, required: true },
    status: { type: String, enum: Object.values(PHOTO_STATUS), default: PHOTO_STATUS.UPLOADED },
    originalFileName: { type: String, required: true },
    contentType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    hash: { type: String, required: true },
    uploadBatchId: { type: String, required: true },
    uploadConfirmed: { type: Boolean, default: false },
    failureReason: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Photo', photoSchema);
