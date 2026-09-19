/**
 * Event Model — photographer-created events with dual QR codes.
 * FR-EVENT-001: Event creation with name, date, venue, cover image, access mode.
 * FR-EVENT-002: Two distinct QR codes (QR-A gallery, QR-B find-my-photos).
 * FR-EVENT-003: QR codes are revocable/regenerable.
 * FR-EVENT-004: Configurable gallery access mode.
 * FR-EVENT-005: Close/archive lifecycle.
 * FR-EVENT-006: Dashboard stats (guest/photo/match counts, storage).
 *
 * SEC-001/SEC-002: tenant_id present and enforced via tenantScope middleware
 * plus data-layer filtering in event.service.js.
 */

const mongoose = require('mongoose');
const crypto = require('crypto');
const { EVENT_STATUS, GALLERY_ACCESS_MODE } = require('@photofolio/shared');

/**
 * Generate a non-guessable, unique token for QR codes.
 * FR-EVENT-002: Each QR encodes a unique, non-guessable event-scoped token.
 * @returns {string} 64-character hex string (32 bytes of entropy)
 */
function generateQrToken() {
  return crypto.randomBytes(32).toString('hex');
}

const eventSchema = new mongoose.Schema(
  {
    // SEC-001: Every event is tenant-scoped
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant ID is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Event name is required'],
      trim: true,
      maxlength: [300, 'Event name cannot exceed 300 characters'],
    },
    // Support single-day or multi-day events
    date: {
      start: {
        type: Date,
        required: [true, 'Event start date is required'],
      },
      end: {
        type: Date,
        default: null, // null = single-day event (end = start)
      },
    },
    venue: {
      type: String,
      trim: true,
      maxlength: [500, 'Venue cannot exceed 500 characters'],
      default: '',
    },
    // FR-EVENT-001: Cover image — S3 key, never a public URL (SEC-003)
    coverImage: {
      type: String,
      default: null,
    },
    // FR-EVENT-004: Gallery access mode
    accessMode: {
      type: String,
      enum: Object.values(GALLERY_ACCESS_MODE),
      default: GALLERY_ACCESS_MODE.LINK_ONLY,
    },
    // FR-EVENT-002: QR-A (Gallery/Info Access) — unique, non-guessable token
    qrAToken: {
      type: String,
      unique: true,
      required: true,
      default: generateQrToken,
    },
    // FR-EVENT-002: QR-B (Find My Photos) — unique, non-guessable token
    qrBToken: {
      type: String,
      unique: true,
      required: true,
      default: generateQrToken,
    },
    // FR-EVENT-005: Event lifecycle status
    status: {
      type: String,
      enum: Object.values(EVENT_STATUS),
      default: EVENT_STATUS.DRAFT,
      index: true,
    },
    // Retention policy ref — configurable per event/tenant (PRIV-004)
    retentionPolicyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RetentionPolicy',
      default: null,
    },
    // FR-EVENT-006: Dashboard stats — updated by later pipeline phases
    stats: {
      guestCount: { type: Number, default: 0, min: 0 },
      photoCount: { type: Number, default: 0, min: 0 },
      processedPhotoCount: { type: Number, default: 0, min: 0 },
      failedPhotoCount: { type: Number, default: 0, min: 0 },
      matchCount: { type: Number, default: 0, min: 0 },
      storageUsedBytes: { type: Number, default: 0, min: 0 },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound index for tenant-scoped dashboard queries
eventSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

// Expose the token generator for service-layer QR regeneration (FR-EVENT-003)
eventSchema.statics.generateQrToken = generateQrToken;

module.exports = mongoose.model('Event', eventSchema);
