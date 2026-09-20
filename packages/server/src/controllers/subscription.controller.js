/**
 * Subscription Controller — handles HTTP requests for subscription management.
 */

const subscriptionService = require('../services/subscription.service');
const razorpayService = require('../services/razorpay.service');
const { AppError } = require('../middleware/errorHandler');

/**
 * GET /api/plans — list available plans (FR-PLAN-002).
 */
async function listPlans(req, res, next) {
  try {
    const plans = await subscriptionService.listPlans();
    res.json({ success: true, data: { plans } });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/subscriptions — subscribe to a plan.
 */
async function subscribe(req, res, next) {
  try {
    const { planId } = req.body;
    if (!planId) {
      throw new AppError('Plan ID is required.', 400, 'MISSING_PLAN_ID');
    }

    const result = await subscriptionService.subscribe(req.tenantId, planId);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/subscriptions/current — current subscription + usage (FR-PLAN-004).
 */
async function getCurrentSubscription(req, res, next) {
  try {
    const result = await subscriptionService.getCurrentSubscription(req.tenantId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/subscriptions/cancel — cancel subscription.
 */
async function cancelSubscription(req, res, next) {
  try {
    const { reason } = req.body;
    const result = await subscriptionService.cancelSubscription(req.tenantId, reason);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/webhooks/razorpay — Razorpay webhook handler (FR-PLAN-005).
 */
async function handleWebhook(req, res, next) {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const rawBody = JSON.stringify(req.body);

    // Verify signature
    if (!razorpayService.verifyWebhookSignature(rawBody, signature)) {
      throw new AppError('Invalid webhook signature.', 401, 'INVALID_SIGNATURE');
    }

    const { event: eventType, payload } = req.body;

    await subscriptionService.handleWebhookEvent(eventType, payload);

    // Always return 200 to acknowledge receipt
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listPlans,
  subscribe,
  getCurrentSubscription,
  cancelSubscription,
  handleWebhook,
};
