/**
 * Profile Service — photographer profile CRUD.
 * FR-PROFILE-001: Create/edit business profile (name, logo, contact, branding).
 * FR-PROFILE-002: Profile changes are versioned/audited.
 * FR-PROFILE-003: View current plan and usage against quota.
 *
 * SEC-001/SEC-002: All operations receive tenantId from verified middleware,
 * never from client input.
 */

const Tenant = require('../models/Tenant');
const Plan = require('../models/Plan');
const Event = require('../models/Event');
const { AppError } = require('../middleware/errorHandler');
const { logAction } = require('./audit.service');
const logger = require('../utils/logger');

/**
 * Get photographer profile with plan and usage summary.
 * FR-PROFILE-001/003: Profile data + subscription/quota info.
 *
 * @param {string} tenantId - Verified tenant ID from middleware.
 * @returns {object} { profile, plan, usage }
 */
async function getProfile(tenantId) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    throw new AppError('Tenant not found.', 404, 'TENANT_NOT_FOUND');
  }

  // FR-PROFILE-003: Current plan and usage
  let plan = null;
  let usage = null;

  if (tenant.planId) {
    plan = await Plan.findById(tenant.planId);

    if (plan) {
      // Calculate current usage against plan quotas
      const eventCount = await Event.countDocuments({ tenantId });
      // Aggregate storage across all events
      const storageAgg = await Event.aggregate([
        { $match: { tenantId: tenant._id } },
        { $group: { _id: null, totalStorage: { $sum: '$stats.storageUsedBytes' } } },
      ]);
      const totalStorageUsed = storageAgg[0]?.totalStorage || 0;

      usage = {
        eventsUsed: eventCount,
        eventsLimit: plan.quotas.maxEvents,
        storageUsedBytes: totalStorageUsed,
        storageLimitBytes: plan.quotas.maxStorageBytes,
      };
    }
  }

  return {
    profile: tenant.toJSON(),
    plan: plan?.toJSON() || null,
    usage,
  };
}

/**
 * Update photographer profile.
 * FR-PROFILE-001: Edit business name, logo, contact, branding.
 * FR-PROFILE-002: Increment profileVersion, audit-log the change.
 *
 * @param {string} tenantId - Verified tenant ID from middleware.
 * @param {object} data - Validated update data.
 * @param {object} actor - Actor info for audit logging.
 * @returns {object} { profile }
 */
async function updateProfile(tenantId, data, actor) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    throw new AppError('Tenant not found.', 404, 'TENANT_NOT_FOUND');
  }

  // Track what changed for audit metadata
  const changes = {};
  const allowedFields = ['businessName', 'logo', 'contactEmail', 'contactPhone', 'brandingColors'];

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      // For nested object (brandingColors), compare JSON
      const oldVal = field === 'brandingColors'
        ? JSON.stringify(tenant[field])
        : tenant[field];
      const newVal = field === 'brandingColors'
        ? JSON.stringify(data[field])
        : data[field];

      if (oldVal !== newVal) {
        changes[field] = { from: tenant[field], to: data[field] };
        tenant[field] = data[field];
      }
    }
  }

  if (Object.keys(changes).length === 0) {
    // No actual changes — return current profile without version bump
    return { profile: tenant.toJSON() };
  }

  // FR-PROFILE-002: Increment version on change
  tenant.profileVersion += 1;
  await tenant.save();

  // SEC-007: Audit log the profile change
  await logAction({
    ...actor,
    action: 'profile.update',
    targetType: 'Tenant',
    targetId: tenant._id,
    metadata: { changes, newVersion: tenant.profileVersion },
  });

  logger.info(
    { tenantId, version: tenant.profileVersion },
    'Profile updated'
  );

  return { profile: tenant.toJSON() };
}

module.exports = { getProfile, updateProfile };
