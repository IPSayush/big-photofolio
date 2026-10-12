/**
 * Guest Model (Worker Copy) — minimal schema for selfie status updates.
 * The worker needs to update guest.selfieStatus after AI processing.
 *
 * AGENTS.md: Worker has its own model copies, never requires from server.
 */

const mongoose = require('mongoose');

const guestSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    sessionTokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    consentRecordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ConsentRecord',
      default: null,
    },
    status: {
      type: String,
      default: 'active',
    },
    selfieStatus: {
      type: String,
      enum: ['none', 'uploading', 'validating', 'accepted', 'rejected', 'processing'],
      default: 'none',
    },
    selfieRejectionReason: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.models.Guest || mongoose.model('Guest', guestSchema);
