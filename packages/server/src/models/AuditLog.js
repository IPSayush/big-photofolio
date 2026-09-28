/**
 * AuditLog Model — immutable append-only security/compliance trail.
 * SEC-007: All admin actions on tenants/plans/quotas are audit-logged.
 * 
 * Records: who did what, to which entity, when.
 * This collection is append-only — no updates or deletes.
 */

const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    actorRole: {
      type: String,
      required: true,
    },
    actorEmail: {
      type: String,
      required: true,
    },
    // Tenant context (null for platform-level admin actions)
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
    },
    action: {
      type: String,
      required: true,
      // Examples: 'user.register', 'user.login', 'tenant.suspend',
      // 'plan.create', 'plan.update', 'event.create', 'event.close'
    },
    targetType: {
      type: String,
      required: true,
      // Examples: 'User', 'Tenant', 'Plan', 'Event', 'Subscription'
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    // Freeform metadata for context (e.g., changed fields, old/new values)
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Immutable — no updates
    // Optimize for time-range queries
    timeseries: undefined, // Standard collection; can migrate to timeseries later
  }
);

// Compound indexes for common query patterns
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
auditLogSchema.index({ tenantId: 1, createdAt: -1 });

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
