/**
 * Guest Model — event-scoped guest sessions.
 * PRD Section 10: Guest entity.
 * DEC-003: Lightweight event-scoped token, no full account required.
 * FR-GUEST-003: Guest created upon consent.
 * FR-GUEST-005: Status tracks consent withdrawal.
 *
 * No cross-event identity in MVP — each event gets a separate guest record.
 */

const mongoose = require('mongoose');
const crypto = require('crypto');
const { GUEST_STATUS } = require('@photofolio/shared');

const guestSchema = new mongoose.Schema(
  {
    // Event this guest belongs to
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
      index: true,
    },
    // DEC-003: Lightweight session token (hashed — never store plaintext)
    sessionTokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    // Reference to consent record
    consentRecordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ConsentRecord',
      default: null,
    },
    // FR-GUEST-005: Status tracks consent state
    status: {
      type: String,
      enum: Object.values(GUEST_STATUS),
      default: GUEST_STATUS.ACTIVE,
    },
    // Selfie processing status — FR-SELFIE-005
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
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Event-level guest queries
guestSchema.index({ eventId: 1, status: 1 });

/**
 * Hash a plain-text session token for secure storage.
 * @param {string} token - Plain-text token.
 * @returns {string} SHA-256 hash.
 */
guestSchema.statics.hashToken = function (token) {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Generate a new crypto-random session token.
 * @returns {{ plainToken: string, hash: string }}
 */
guestSchema.statics.generateSessionToken = function () {
  const plainToken = crypto.randomBytes(32).toString('hex');
  const hash = this.hashToken(plainToken);
  return { plainToken, hash };
};

module.exports = mongoose.model('Guest', guestSchema);
