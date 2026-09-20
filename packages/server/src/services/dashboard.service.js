/**
 * Dashboard Service — photographer and admin monitoring stats.
 * FR-MON-001: Photographer per-event dashboard.
 * FR-MON-002: Admin platform-wide dashboard.
 * FR-MON-003: Admin suspend/reinstate tenant or event.
 */

const mongoose = require('mongoose');
const Event = require('../models/Event');
const Photo = require('../models/Photo');
const Guest = require('../models/Guest');
const Match = require('../models/Match');
const Tenant = require('../models/Tenant');
const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');
const { AppError } = require('../middleware/errorHandler');
const { TENANT_STATUS, EVENT_STATUS, PHOTO_STATUS } = require('@photofolio/shared');
const logger = require('../utils/logger');
const AuditLog = require('../models/AuditLog');

// ─── Photographer Dashboard (FR-MON-001) ───

/**
 * Get photographer dashboard — per-event stats + quota overview.
 * FR-MON-001: storage used, photos uploaded/processed, guests, matches, quota remaining.
 *
 * @param {string} tenantId
 * @returns {Promise<object>}
 */
async function getPhotographerDashboard(tenantId) {
  const tenantObjId = new mongoose.Types.ObjectId(tenantId.toString());

  // Get all events with their stats
  const events = await Event.find({ tenantId: tenantObjId })
    .select('name dateStart dateEnd venue status stats accessMode createdAt')
    .sort({ createdAt: -1 })
    .lean();

  // Get plan and quota
  const tenant = await Tenant.findById(tenantObjId).lean();
  let plan = null;
  let quotaRemaining = null;

  if (tenant?.planId) {
    plan = await Plan.findById(tenant.planId).lean();
    if (plan) {
      const totalPhotos = events.reduce((sum, e) => sum + (e.stats?.photoCount || 0), 0);
      const totalStorage = events.reduce((sum, e) => sum + (e.stats?.storageUsedBytes || 0), 0);
      const totalGuests = events.reduce((sum, e) => sum + (e.stats?.guestCount || 0), 0);
      const totalMatches = events.reduce((sum, e) => sum + (e.stats?.matchCount || 0), 0);

      quotaRemaining = {
        events: plan.quotas.maxEvents - events.length,
        photosPerEvent: plan.quotas.maxPhotosPerEvent,
        storageBytes: plan.quotas.maxStorageBytes - totalStorage,
        guestsPerEvent: plan.quotas.maxGuestsPerEvent,
        aiMatches: plan.quotas.maxAiMatchesPerMonth - totalMatches,
      };
    }
  }

  // Aggregate totals
  const totals = {
    events: events.length,
    activeEvents: events.filter((e) => e.status === EVENT_STATUS.ACTIVE).length,
    totalPhotos: events.reduce((sum, e) => sum + (e.stats?.photoCount || 0), 0),
    processedPhotos: events.reduce((sum, e) => sum + (e.stats?.processedPhotoCount || 0), 0),
    failedPhotos: events.reduce((sum, e) => sum + (e.stats?.failedPhotoCount || 0), 0),
    totalGuests: events.reduce((sum, e) => sum + (e.stats?.guestCount || 0), 0),
    totalMatches: events.reduce((sum, e) => sum + (e.stats?.matchCount || 0), 0),
    totalStorageBytes: events.reduce((sum, e) => sum + (e.stats?.storageUsedBytes || 0), 0),
  };

  return {
    totals,
    events,
    plan: plan ? { name: plan.name, quotas: plan.quotas } : null,
    quotaRemaining,
  };
}

// ─── Admin Dashboard (FR-MON-002) ───

/**
 * Get admin platform-wide dashboard.
 * FR-MON-002: tenant list, plan distribution, storage totals, AI volume, abuse flags.
 *
 * @param {{ page, limit }} pagination
 * @returns {Promise<object>}
 */
async function getAdminDashboard({ page = 1, limit = 20 } = {}) {
  const skip = (page - 1) * limit;

  // Platform-wide counts
  const [
    totalTenants,
    activeTenants,
    suspendedTenants,
    totalEvents,
    activeEvents,
    totalPhotos,
    processedPhotos,
    totalGuests,
    totalMatches,
  ] = await Promise.all([
    Tenant.countDocuments(),
    Tenant.countDocuments({ status: TENANT_STATUS.ACTIVE }),
    Tenant.countDocuments({ status: TENANT_STATUS.SUSPENDED }),
    Event.countDocuments(),
    Event.countDocuments({ status: EVENT_STATUS.ACTIVE }),
    Photo.countDocuments(),
    Photo.countDocuments({ status: PHOTO_STATUS.PROCESSED }),
    Guest.countDocuments(),
    Match.countDocuments(),
  ]);

  // Plan distribution
  const planDistribution = await Subscription.aggregate([
    { $match: { status: { $in: ['active', 'trialing'] } } },
    { $group: { _id: '$planId', count: { $sum: 1 } } },
  ]);

  // Populate plan names
  const planDist = await Promise.all(
    planDistribution.map(async (pd) => {
      const plan = await Plan.findById(pd._id).select('name').lean();
      return { planName: plan?.name || 'Unknown', count: pd.count };
    })
  );

  // Tenant list (paginated)
  const tenants = await Tenant.find()
    .select('businessName contactEmail status planId createdAt')
    .populate('planId', 'name')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  return {
    platform: {
      totalTenants,
      activeTenants,
      suspendedTenants,
      totalEvents,
      activeEvents,
      totalPhotos,
      processedPhotos,
      totalGuests,
      totalMatches,
    },
    planDistribution: planDist,
    tenants,
    pagination: { page, limit, total: totalTenants, pages: Math.ceil(totalTenants / limit) },
  };
}

// ─── Admin Suspend/Reinstate (FR-MON-003) ───

/**
 * Suspend a tenant — FR-MON-003.
 * @param {string} tenantId
 * @param {string} reason
 * @param {object} adminUser - { userId, role, email }
 * @returns {Promise<object>}
 */
async function suspendTenant(tenantId, reason, adminUser) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    throw new AppError('Tenant not found.', 404, 'TENANT_NOT_FOUND');
  }

  if (tenant.status === TENANT_STATUS.SUSPENDED) {
    throw new AppError('Tenant is already suspended.', 409, 'ALREADY_SUSPENDED');
  }

  tenant.status = TENANT_STATUS.SUSPENDED;
  await tenant.save();

  // Audit log — SEC-007
  await AuditLog.create({
    actorId: adminUser.userId,
    actorRole: adminUser.role,
    actorEmail: adminUser.email,
    action: 'tenant.suspended',
    targetType: 'Tenant',
    targetId: tenant._id,
    metadata: { reason },
  });

  logger.info(
    { tenantId: tenant._id.toString(), reason, adminUserId: adminUser.userId },
    'Tenant suspended by admin'
  );

  return { tenantId: tenant._id, status: tenant.status, reason };
}

/**
 * Reinstate a tenant — FR-MON-003.
 * @param {string} tenantId
 * @param {object} adminUser - { userId, role, email }
 * @returns {Promise<object>}
 */
async function reinstateTenant(tenantId, adminUser) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    throw new AppError('Tenant not found.', 404, 'TENANT_NOT_FOUND');
  }

  if (tenant.status !== TENANT_STATUS.SUSPENDED) {
    throw new AppError('Tenant is not suspended.', 409, 'NOT_SUSPENDED');
  }

  tenant.status = TENANT_STATUS.ACTIVE;
  await tenant.save();

  // Audit log — SEC-007
  await AuditLog.create({
    actorId: adminUser.userId,
    actorRole: adminUser.role,
    actorEmail: adminUser.email,
    action: 'tenant.reinstated',
    targetType: 'Tenant',
    targetId: tenant._id,
  });

  logger.info(
    { tenantId: tenant._id.toString(), adminUserId: adminUser.userId },
    'Tenant reinstated by admin'
  );

  return { tenantId: tenant._id, status: tenant.status };
}

/**
 * Suspend an event — FR-MON-003.
 * @param {string} eventId
 * @param {string} reason
 * @param {object} adminUser - { userId, role, email }
 * @returns {Promise<object>}
 */
async function suspendEvent(eventId, reason, adminUser) {
  const event = await Event.findById(eventId);
  if (!event) {
    throw new AppError('Event not found.', 404, 'EVENT_NOT_FOUND');
  }

  const previousStatus = event.status;
  event.status = EVENT_STATUS.CLOSED;
  await event.save();

  await AuditLog.create({
    actorId: adminUser.userId,
    actorRole: adminUser.role,
    actorEmail: adminUser.email,
    action: 'event.suspended',
    targetType: 'Event',
    targetId: event._id,
    metadata: { reason, previousStatus },
  });

  logger.info(
    { eventId: event._id.toString(), reason, adminUserId: adminUser.userId },
    'Event suspended by admin'
  );

  return { eventId: event._id, status: event.status, reason };
}

module.exports = {
  getPhotographerDashboard,
  getAdminDashboard,
  suspendTenant,
  reinstateTenant,
  suspendEvent,
};
