/**
 * ConsentRecord Model — immutable consent audit log.
 * PRD Section 10: ConsentRecord entity.
 * FR-GUEST-003: Consent recorded with timestamp, event ID, version.
 * PRIV-002: Consent text versioned and re-shown if changed.
 *
 * IMMUTABLE: Records are append-only — no updates or deletes.
 * Withdrawal is recorded as a new field (withdrawnAt) on the original record.
 */

const mongoose = require('mongoose');

const consentRecordSchema = new mongoose.Schema(
  {
    // Guest who gave consent
    guestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Guest',
      required: [true, 'Guest ID is required'],
      index: true,
    },
    // Event context
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
    },
    // PRIV-002: Versioned consent text
    consentTextVersion: {
      type: String,
      required: [true, 'Consent text version is required'],
    },
    // FR-GUEST-003: Timestamp of consent
    consentedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    // FR-GUEST-005 / PRIV-003: Withdrawal timestamp (null = active consent)
    withdrawnAt: {
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

// Lookup by guest + event
consentRecordSchema.index({ guestId: 1, eventId: 1 });

module.exports = mongoose.model('ConsentRecord', consentRecordSchema);
