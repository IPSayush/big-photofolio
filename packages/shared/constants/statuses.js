/**
 * Status enums for core entities.
 * Used across server, worker, and client for consistency.
 */

/** Tenant account status */
const TENANT_STATUS = Object.freeze({
  ACTIVE: 'active',
  SUSPENDED: 'suspended',       // FR-MON-003 — admin can suspend
  PAYMENT_HOLD: 'payment_hold', // Billing issue
  DEACTIVATED: 'deactivated',
});

/** Subscription status */
const SUBSCRIPTION_STATUS = Object.freeze({
  TRIALING: 'trialing',   // FR-PLAN-006
  ACTIVE: 'active',
  PAST_DUE: 'past_due',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
});

/** Event lifecycle status */
const EVENT_STATUS = Object.freeze({
  DRAFT: 'draft',
  ACTIVE: 'active',
  CLOSED: 'closed',       // FR-EVENT-005
  ARCHIVED: 'archived',   // FR-EVENT-005
});

/** Photo processing pipeline status — FR-PIPE-002 */
const PHOTO_STATUS = Object.freeze({
  UPLOADED: 'uploaded',
  VALIDATING: 'validating',
  PROCESSING: 'processing',
  PROCESSED: 'processed',
  FAILED: 'failed',
});

/** Individual pipeline stage status */
const PIPELINE_STAGE = Object.freeze({
  INGEST_VALIDATION: 'ingest_validation',
  DERIVATIVE_GENERATION: 'derivative_generation',
  FACE_DETECTION: 'face_detection',
  FACE_EMBEDDING: 'face_embedding',
  FACE_MATCHING: 'face_matching',
});

/** Photo derivative types — FR-PIPE-002 */
const DERIVATIVE_TYPE = Object.freeze({
  THUMBNAIL: 'thumbnail',
  WEB_OPTIMIZED: 'web_optimized',
  WATERMARKED: 'watermarked',
});

/** Gallery access modes — FR-EVENT-004 */
const GALLERY_ACCESS_MODE = Object.freeze({
  PUBLIC_WITHIN_EVENT: 'public_within_event',
  LINK_ONLY: 'link_only',
  FIND_MY_PHOTOS_ONLY: 'find_my_photos_only',
});

/** User account status */
const USER_STATUS = Object.freeze({
  PENDING_VERIFICATION: 'pending_verification',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  DEACTIVATED: 'deactivated',
});

/** Guest session status — FR-GUEST-005 */
const GUEST_STATUS = Object.freeze({
  ACTIVE: 'active',
  CONSENT_WITHDRAWN: 'consent_withdrawn',
});

/** Selfie processing status — FR-SELFIE-005 */
const SELFIE_STATUS = Object.freeze({
  UPLOADING: 'uploading',
  VALIDATING: 'validating',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  PROCESSING: 'processing',
});

module.exports = {
  TENANT_STATUS,
  SUBSCRIPTION_STATUS,
  EVENT_STATUS,
  PHOTO_STATUS,
  PIPELINE_STAGE,
  DERIVATIVE_TYPE,
  GALLERY_ACCESS_MODE,
  USER_STATUS,
  GUEST_STATUS,
  SELFIE_STATUS,
};
