/**
 * Tenant Model — root of multi-tenant isolation.
 * DATA entity: Tenant (Photographer Account)
 * 
 * Every tenant-scoped query MUST filter by tenant_id (SEC-001, SEC-002).
 * This is enforced at the middleware layer (tenantScope.js), not per-query.
 */

const mongoose = require('mongoose');
const { TENANT_STATUS } = require('@photofolio/shared');

const tenantSchema = new mongoose.Schema(
  {
    businessName: {
      type: String,
      required: [true, 'Business name is required'],
      trim: true,
      maxlength: [200, 'Business name cannot exceed 200 characters'],
    },
    // FR-PROFILE-001: branding
    logo: {
      type: String, // S3 key — never a public URL (SEC-003)
      default: null,
    },
    brandingColors: {
      primary: { type: String, default: '#000000' },
      secondary: { type: String, default: '#ffffff' },
    },
    contactEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    contactPhone: {
      type: String,
      trim: true,
      default: null,
    },
    status: {
      type: String,
      enum: Object.values(TENANT_STATUS),
      default: TENANT_STATUS.ACTIVE,
      index: true,
    },
    // FR-PLAN-003/004: plan and usage tracking
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan',
      default: null,
    },
    // FR-PROFILE-002: profile versioning for audit
    profileVersion: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Index for admin queries — FR-MON-002
tenantSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Tenant', tenantSchema);
