/**
 * Plan Model — admin-editable subscription plans.
 * FR-PLAN-001: No hardcoded values in application code (NFR-MAINT-001).
 * 
 * Admins define plans with quotas, pricing, and feature flags via the admin
 * interface. Application code reads these at runtime — never hard-codes
 * limits, prices, or retention periods.
 */

const mongoose = require('mongoose');

const planSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Plan name is required'],
      trim: true,
      unique: true,
      maxlength: 100,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    // FR-PLAN-005: Razorpay plan ID for subscription management
    razorpayPlanId: {
      type: String,
      default: null,
    },
    // NFR-MAINT-001: All pricing/quotas are admin-configurable, never hardcoded
    pricing: {
      amount: {
        type: Number,
        required: true,
        min: 0,
      },
      currency: {
        type: String,
        required: true,
        default: 'INR',
        uppercase: true,
        maxlength: 3,
      },
      interval: {
        type: String,
        enum: ['monthly', 'yearly'],
        default: 'monthly',
      },
    },
    // FR-PLAN-001/003: quota limits enforced server-side
    quotas: {
      maxEvents: {
        type: Number,
        required: true,
        min: 1,
      },
      maxPhotosPerEvent: {
        type: Number,
        required: true,
        min: 1,
      },
      maxStorageBytes: {
        type: Number,
        required: true,
        min: 1,
      },
      maxGuestsPerEvent: {
        type: Number,
        required: true,
        min: 1,
      },
      maxAiMatchesPerMonth: {
        type: Number,
        required: true,
        min: 0,
      },
    },
    // Feature flags — FR-PLAN-001: configurable feature availability
    features: {
      originalDownload: { type: Boolean, default: false },
      customBranding: { type: Boolean, default: false },
      watermarkRemoval: { type: Boolean, default: false },
      priorityProcessing: { type: Boolean, default: false },
    },
    // FR-PLAN-006: trial configuration
    trialDays: {
      type: Number,
      default: 0, // 0 = no trial; admin sets via UI
      min: 0,
    },
    // Retention defaults — configurable per DEC-004
    retentionDefaults: {
      faceDataRetentionDays: {
        type: Number,
        default: 90,
        min: 1,
      },
      eventPhotoRetentionDays: {
        type: Number,
        default: 365,
        min: 1,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

// Index for listing active plans in order
planSchema.index({ isActive: 1, sortOrder: 1 });

module.exports = mongoose.model('Plan', planSchema);
