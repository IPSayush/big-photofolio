/**
 * Quota Check Middleware — enforces plan quotas at the backend.
 * FR-PLAN-003: Every quota-relevant operation checked server-side.
 * NFR-MAINT-001: Quotas read from Plan config, never hardcoded.
 *
 * Usage: apply as middleware before the route handler.
 * e.g. router.post('/', authenticate, checkEventQuota, createEvent)
 */

const Tenant = require('../models/Tenant');
const Plan = require('../models/Plan');
const Event = require('../models/Event');
const Photo = require('../models/Photo');
const Guest = require('../models/Guest');
const { AppError } = require('./errorHandler');
const logger = require('../utils/logger');

/**
 * Load tenant's plan with quotas.
 * @param {string} tenantId
 * @returns {Promise<{ plan, tenant }>}
 */
async function loadPlanForTenant(tenantId) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    throw new AppError('Tenant not found.', 404, 'TENANT_NOT_FOUND');
  }

  if (!tenant.planId) {
    throw new AppError(
      'No active plan. Please subscribe to a plan.',
      403,
      'NO_ACTIVE_PLAN'
    );
  }

  const plan = await Plan.findById(tenant.planId);
  if (!plan || !plan.isActive) {
    throw new AppError(
      'Your plan is no longer available. Please contact support.',
      403,
      'PLAN_UNAVAILABLE'
    );
  }

  return { plan, tenant };
}

/**
 * Check event creation quota — FR-PLAN-003.
 * Blocks if tenant has reached maxEvents.
 */
async function checkEventQuota(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { plan } = await loadPlanForTenant(tenantId);

    const currentEventCount = await Event.countDocuments({ tenantId });

    if (currentEventCount >= plan.quotas.maxEvents) {
      logger.warn(
        { tenantId, current: currentEventCount, max: plan.quotas.maxEvents },
        'Event quota exceeded'
      );
      throw new AppError(
        `Event limit reached (${currentEventCount}/${plan.quotas.maxEvents}). Upgrade your plan for more events.`,
        403,
        'QUOTA_EXCEEDED',
        { quota: 'maxEvents', current: currentEventCount, max: plan.quotas.maxEvents }
      );
    }

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Check photo upload quota — FR-PLAN-003.
 * Blocks if event has reached maxPhotosPerEvent.
 */
async function checkPhotoQuota(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const eventId = req.params.eventId;
    const { plan } = await loadPlanForTenant(tenantId);

    const currentPhotoCount = await Photo.countDocuments({ eventId });

    // Check per-request batch size
    const requestedCount = req.body.files?.length || 1;
    const totalAfterUpload = currentPhotoCount + requestedCount;

    if (totalAfterUpload > plan.quotas.maxPhotosPerEvent) {
      logger.warn(
        { tenantId, eventId, current: currentPhotoCount, requested: requestedCount, max: plan.quotas.maxPhotosPerEvent },
        'Photo quota exceeded'
      );
      throw new AppError(
        `Photo limit would be exceeded (${currentPhotoCount}+${requestedCount}/${plan.quotas.maxPhotosPerEvent}). Upgrade your plan.`,
        403,
        'QUOTA_EXCEEDED',
        { quota: 'maxPhotosPerEvent', current: currentPhotoCount, max: plan.quotas.maxPhotosPerEvent }
      );
    }

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Check guest quota — FR-PLAN-003.
 * Applied to consent endpoint to limit guests per event.
 */
async function checkGuestQuota(req, res, next) {
  try {
    // Guest consent uses qrToken, need to find event first
    const { qrToken } = req.body;
    if (!qrToken) return next(); // Let controller handle missing token

    const Event2 = require('../models/Event');
    const event = await Event2.findOne({ qrBToken: qrToken });
    if (!event) return next(); // Let controller handle invalid token

    const { plan } = await loadPlanForTenant(event.tenantId);

    const currentGuestCount = await Guest.countDocuments({
      eventId: event._id,
      status: 'active',
    });

    if (currentGuestCount >= plan.quotas.maxGuestsPerEvent) {
      logger.warn(
        { tenantId: event.tenantId, eventId: event._id, current: currentGuestCount, max: plan.quotas.maxGuestsPerEvent },
        'Guest quota exceeded'
      );
      throw new AppError(
        `Guest limit reached for this event (${currentGuestCount}/${plan.quotas.maxGuestsPerEvent}).`,
        403,
        'QUOTA_EXCEEDED',
        { quota: 'maxGuestsPerEvent', current: currentGuestCount, max: plan.quotas.maxGuestsPerEvent }
      );
    }

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  loadPlanForTenant,
  checkEventQuota,
  checkPhotoQuota,
  checkGuestQuota,
};
