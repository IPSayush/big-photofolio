/**
 * Subscription Service — subscription lifecycle and usage tracking.
 * FR-PLAN-002: Subscribe/upgrade/downgrade.
 * FR-PLAN-004: Real-time usage vs. quota.
 * FR-PLAN-005: Razorpay integration.
 * FR-PLAN-006: Trial support.
 */

const Plan = require('../models/Plan');
const Tenant = require('../models/Tenant');
const Subscription = require('../models/Subscription');
const Event = require('../models/Event');
const Photo = require('../models/Photo');
const Guest = require('../models/Guest');
const Match = require('../models/Match');
const { AppError } = require('../middleware/errorHandler');
const { SUBSCRIPTION_STATUS } = require('@photofolio/shared');
const razorpayService = require('./razorpay.service');
const logger = require('../utils/logger');

/**
 * List active plans — FR-PLAN-002.
 * @returns {Promise<Array>}
 */
async function listPlans() {
  return Plan.find({ isActive: true })
    .sort({ sortOrder: 1, 'pricing.amount': 1 })
    .select('-razorpayPlanId')
    .lean();
}

/**
 * Subscribe a tenant to a plan — FR-PLAN-002/005.
 * @param {string} tenantId
 * @param {string} planId
 * @returns {Promise<object>} Subscription details.
 */
async function subscribe(tenantId, planId) {
  const plan = await Plan.findById(planId);
  if (!plan || !plan.isActive) {
    throw new AppError('Plan not found or no longer available.', 404, 'PLAN_NOT_FOUND');
  }

  // Check for existing active subscription
  const existing = await Subscription.findOne({
    tenantId,
    status: { $in: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.TRIALING] },
  });

  if (existing) {
    throw new AppError(
      'You already have an active subscription. Cancel it first to switch plans.',
      409,
      'SUBSCRIPTION_EXISTS'
    );
  }

  // Ensure plan has a Razorpay plan ID (create if needed)
  let razorpayPlanId = plan.razorpayPlanId;
  if (!razorpayPlanId) {
    razorpayPlanId = await razorpayService.createRazorpayPlan(plan);
    plan.razorpayPlanId = razorpayPlanId;
    await plan.save();
  }

  // Create Razorpay subscription — FR-PLAN-005
  const tenant = await Tenant.findById(tenantId);
  const razorpayResult = await razorpayService.createRazorpaySubscription(
    razorpayPlanId,
    {
      email: tenant.contactEmail,
      tenantId: tenantId.toString(),
      trialDays: plan.trialDays || 0,
    }
  );

  // Determine initial status — FR-PLAN-006
  const now = new Date();
  let status = SUBSCRIPTION_STATUS.ACTIVE;
  let trialEnd = null;

  if (plan.trialDays > 0) {
    status = SUBSCRIPTION_STATUS.TRIALING;
    trialEnd = new Date(now.getTime() + plan.trialDays * 86400000);
  }

  // Calculate period end (1 month or 1 year)
  const periodEnd = new Date(now);
  if (plan.pricing.interval === 'yearly') {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  // Create subscription record
  const subscription = await Subscription.create({
    tenantId,
    planId: plan._id,
    razorpaySubscriptionId: razorpayResult.subscriptionId,
    status,
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    trialEnd,
  });

  // Update tenant's active plan
  await Tenant.findByIdAndUpdate(tenantId, { planId: plan._id });

  logger.info(
    {
      tenantId,
      planId: plan._id.toString(),
      subscriptionId: subscription._id.toString(),
      razorpaySubId: razorpayResult.subscriptionId,
      status,
    },
    'Subscription created'
  );

  return {
    subscriptionId: subscription._id,
    planName: plan.name,
    status: subscription.status,
    currentPeriodEnd: subscription.currentPeriodEnd,
    trialEnd: subscription.trialEnd,
    razorpayUrl: razorpayResult.shortUrl,
  };
}

/**
 * Get current subscription with usage stats — FR-PLAN-004.
 * @param {string} tenantId
 * @returns {Promise<object>}
 */
async function getCurrentSubscription(tenantId) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    throw new AppError('Tenant not found.', 404, 'TENANT_NOT_FOUND');
  }

  const subscription = await Subscription.findOne({
    tenantId,
    status: { $in: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.TRIALING, SUBSCRIPTION_STATUS.PAST_DUE] },
  }).populate('planId');

  const usage = await getUsageStats(tenantId);

  return {
    subscription: subscription
      ? {
          id: subscription._id,
          planName: subscription.planId?.name,
          status: subscription.status,
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd,
          trialEnd: subscription.trialEnd,
        }
      : null,
    plan: subscription?.planId || null,
    usage,
  };
}

/**
 * Get real-time usage stats for a tenant — FR-PLAN-004.
 * @param {string} tenantId
 * @returns {Promise<object>}
 */
async function getUsageStats(tenantId) {
  const mongoose = require('mongoose');
  const tenantObjId = new mongoose.Types.ObjectId(tenantId.toString());

  const [eventCount, photoCount, storageAgg, matchCount] = await Promise.all([
    Event.countDocuments({ tenantId: tenantObjId }),
    Photo.countDocuments({ tenantId: tenantObjId }),
    Photo.aggregate([
      { $match: { tenantId: tenantObjId } },
      { $group: { _id: null, totalBytes: { $sum: '$sizeBytes' } } },
    ]),
    Match.countDocuments({ tenantId: tenantObjId }),
  ]);

  // Guest count across all events for this tenant
  const events = await Event.find({ tenantId: tenantObjId }).select('_id').lean();
  const eventIds = events.map((e) => e._id);
  const guestCount = eventIds.length > 0
    ? await Guest.countDocuments({ eventId: { $in: eventIds }, status: 'active' })
    : 0;

  return {
    eventsUsed: eventCount,
    photosUploaded: photoCount,
    storageBytesUsed: storageAgg[0]?.totalBytes || 0,
    guestsOnboarded: guestCount,
    matchesGenerated: matchCount,
  };
}

/**
 * Cancel subscription — FR-PLAN-002.
 * @param {string} tenantId
 * @param {string} [reason]
 * @returns {Promise<object>}
 */
async function cancelSubscription(tenantId, reason) {
  const subscription = await Subscription.findOne({
    tenantId,
    status: { $in: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.TRIALING] },
  });

  if (!subscription) {
    throw new AppError('No active subscription to cancel.', 404, 'NO_ACTIVE_SUBSCRIPTION');
  }

  // Cancel on Razorpay
  if (subscription.razorpaySubscriptionId) {
    await razorpayService.cancelRazorpaySubscription(subscription.razorpaySubscriptionId);
  }

  // Update subscription
  subscription.status = SUBSCRIPTION_STATUS.CANCELLED;
  subscription.cancelledAt = new Date();
  subscription.cancellationReason = reason || 'User cancelled';
  await subscription.save();

  logger.info(
    { tenantId, subscriptionId: subscription._id.toString(), reason },
    'Subscription cancelled'
  );

  return {
    subscriptionId: subscription._id,
    status: SUBSCRIPTION_STATUS.CANCELLED,
    cancelledAt: subscription.cancelledAt,
  };
}

/**
 * Handle Razorpay webhook event — FR-PLAN-005.
 * @param {string} eventType - Razorpay event type.
 * @param {object} payload - Webhook payload.
 * @returns {Promise<void>}
 */
async function handleWebhookEvent(eventType, payload) {
  const subscriptionEntity = payload?.subscription?.entity;
  if (!subscriptionEntity?.id) {
    logger.warn({ eventType }, 'Webhook: no subscription entity in payload');
    return;
  }

  const razorpaySubId = subscriptionEntity.id;
  const subscription = await Subscription.findOne({ razorpaySubscriptionId: razorpaySubId });

  if (!subscription) {
    logger.warn({ razorpaySubId, eventType }, 'Webhook: subscription not found');
    return;
  }

  switch (eventType) {
    case 'subscription.activated':
      subscription.status = SUBSCRIPTION_STATUS.ACTIVE;
      break;

    case 'subscription.charged':
      subscription.status = SUBSCRIPTION_STATUS.ACTIVE;
      subscription.lastPaymentAt = new Date();
      // Extend period
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      subscription.currentPeriodStart = new Date();
      subscription.currentPeriodEnd = periodEnd;
      break;

    case 'subscription.pending':
      subscription.status = SUBSCRIPTION_STATUS.PAST_DUE;
      break;

    case 'subscription.halted':
    case 'subscription.cancelled':
      subscription.status = SUBSCRIPTION_STATUS.CANCELLED;
      subscription.cancelledAt = new Date();
      break;

    default:
      logger.info({ eventType, razorpaySubId }, 'Webhook: unhandled event type');
      return;
  }

  await subscription.save();

  logger.info(
    { eventType, razorpaySubId, newStatus: subscription.status },
    'Webhook: subscription updated'
  );
}

module.exports = {
  listPlans,
  subscribe,
  getCurrentSubscription,
  getUsageStats,
  cancelSubscription,
  handleWebhookEvent,
};
