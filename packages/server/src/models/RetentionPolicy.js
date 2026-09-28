/**
 * RetentionPolicy Model — configurable data retention rules.
 * PRIV-004 / DEC-004: Face data and photo retention is configurable
 * per tenant/plan, never hardcoded (NFR-MAINT-001).
 * 
 * Each tenant can have a custom policy; falls back to plan defaults.
 */

const mongoose = require('mongoose');

const retentionPolicySchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
    },
    // DEC-004: face data default = 90 days, configurable
    faceDataRetentionDays: {
      type: Number,
      required: true,
      default: 90,
      min: 1,
    },
    // DEC-004: event photo default = 365 days, configurable
    eventPhotoRetentionDays: {
      type: Number,
      required: true,
      default: 365,
      min: 1,
    },
    // Original photos may have different retention than derivatives
    originalPhotoRetentionDays: {
      type: Number,
      required: true,
      default: 365,
      min: 1,
    },
    // Whether to auto-delete or just flag for manual review
    autoDelete: {
      type: Boolean,
      default: true,
    },
    // Custom deletion rules as JSON for flexibility
    customRules: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// One policy per tenant
retentionPolicySchema.index({ tenantId: 1 }, { unique: true });

module.exports = mongoose.models.RetentionPolicy || mongoose.model('RetentionPolicy', retentionPolicySchema);
