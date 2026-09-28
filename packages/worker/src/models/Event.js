/**
 * Worker-side Event model — minimal copy for stats updates.
 */

const mongoose = require('mongoose');
const { EVENT_STATUS } = require('@photofolio/shared');

const eventSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    name: { type: String, required: true },
    status: { type: String, enum: Object.values(EVENT_STATUS), default: EVENT_STATUS.DRAFT },
    stats: {
      photoCount: { type: Number, default: 0 },
      processedPhotoCount: { type: Number, default: 0 },
      failedPhotoCount: { type: Number, default: 0 },
      guestCount: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Event || mongoose.model('Event', eventSchema);
