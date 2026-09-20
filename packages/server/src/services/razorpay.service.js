/**
 * Razorpay Service — payment gateway integration.
 * FR-PLAN-005: Razorpay subscriptions + webhooks.
 *
 * In test mode (NODE_ENV=test), all Razorpay API calls return mock responses.
 * In production, uses the `razorpay` npm package.
 */

const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * Create a Razorpay plan (syncs Plan model to Razorpay).
 * @param {object} plan - Plan document.
 * @returns {Promise<string>} Razorpay plan ID.
 */
async function createRazorpayPlan(plan) {
  if (process.env.NODE_ENV === 'test') {
    return `plan_mock_${plan._id || Date.now()}`;
  }

  const Razorpay = require('razorpay');
  const instance = getRazorpayInstance();

  const razorpayPlan = await instance.plans.create({
    period: plan.pricing.interval === 'yearly' ? 'yearly' : 'monthly',
    interval: 1,
    item: {
      name: plan.name,
      amount: plan.pricing.amount * 100, // Razorpay expects paise
      currency: plan.pricing.currency,
    },
  });

  logger.info({ planId: plan._id, razorpayPlanId: razorpayPlan.id }, 'Razorpay plan created');
  return razorpayPlan.id;
}

/**
 * Create a Razorpay subscription for a tenant.
 * @param {string} razorpayPlanId - Razorpay plan ID.
 * @param {object} options - { email, tenantId, trialDays }
 * @returns {Promise<object>} { subscriptionId, shortUrl }
 */
async function createRazorpaySubscription(razorpayPlanId, options = {}) {
  if (process.env.NODE_ENV === 'test') {
    const mockId = `sub_mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return {
      subscriptionId: mockId,
      shortUrl: `https://rzp.io/mock/${mockId}`,
      status: options.trialDays > 0 ? 'created' : 'created',
    };
  }

  const instance = getRazorpayInstance();

  const subOptions = {
    plan_id: razorpayPlanId,
    total_count: 120, // Max billing cycles
    quantity: 1,
    notes: {
      tenantId: options.tenantId,
    },
  };

  // FR-PLAN-006: Trial period
  if (options.trialDays && options.trialDays > 0) {
    subOptions.start_at = Math.floor(Date.now() / 1000) + (options.trialDays * 86400);
  }

  const subscription = await instance.subscriptions.create(subOptions);

  logger.info(
    { tenantId: options.tenantId, razorpaySubId: subscription.id },
    'Razorpay subscription created'
  );

  return {
    subscriptionId: subscription.id,
    shortUrl: subscription.short_url,
    status: subscription.status,
  };
}

/**
 * Cancel a Razorpay subscription.
 * @param {string} subscriptionId - Razorpay subscription ID.
 * @param {boolean} cancelAtEnd - Cancel at end of billing cycle.
 * @returns {Promise<object>}
 */
async function cancelRazorpaySubscription(subscriptionId, cancelAtEnd = true) {
  if (process.env.NODE_ENV === 'test') {
    return { id: subscriptionId, status: 'cancelled' };
  }

  const instance = getRazorpayInstance();
  const result = await instance.subscriptions.cancel(subscriptionId, cancelAtEnd);

  logger.info({ razorpaySubId: subscriptionId }, 'Razorpay subscription cancelled');
  return result;
}

/**
 * Verify Razorpay webhook signature.
 * @param {string} body - Raw request body.
 * @param {string} signature - X-Razorpay-Signature header.
 * @returns {boolean}
 */
function verifyWebhookSignature(body, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    logger.warn('RAZORPAY_WEBHOOK_SECRET not configured');
    return false;
  }

  // In test mode, accept a test signature
  if (process.env.NODE_ENV === 'test') {
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');
    return signature === expectedSig;
  }

  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSig)
  );
}

/**
 * Get Razorpay instance (singleton).
 */
let _instance = null;
function getRazorpayInstance() {
  if (_instance) return _instance;

  const Razorpay = require('razorpay');
  _instance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });

  return _instance;
}

module.exports = {
  createRazorpayPlan,
  createRazorpaySubscription,
  cancelRazorpaySubscription,
  verifyWebhookSignature,
};
