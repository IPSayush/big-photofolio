/**
 * Subscription Model — Razorpay subscription lifecycle.
 * PRD Section 10: Subscription entity.
 * FR-PLAN-005: Tied to Razorpay subscription.
 * FR-PLAN-006: Trial support (configurable).
 */

const mongoose = require('mongoose');
const { SUBSCRIPTION_STATUS } = require('@photofolio/shared');

const subscriptionSchema = new mongoose.Schema(
  {
    // Tenant owning this subscription
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant ID is required'],
    },
    // Plan subscribed to
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan',
      required: [true, 'Plan ID is required'],
    },
    // FR-PLAN-005: Razorpay subscription reference
    razorpaySubscriptionId: {
      type: String,
      default: null,
      index: true,
    },
    // Razorpay customer ID
    razorpayCustomerId: {
      type: String,
      default: null,
    },
    // Subscription lifecycle status
    status: {
      type: String,
      enum: Object.values(SUBSCRIPTION_STATUS),
      default: SUBSCRIPTION_STATUS.ACTIVE,
      index: true,
    },
    // Current billing period
    currentPeriodStart: {
      type: Date,
      default: Date.now,
    },
    currentPeriodEnd: {
      type: Date,
      default: null,
    },
    // FR-PLAN-006: Trial period
    trialEnd: {
      type: Date,
      default: null,
    },
    // Cancellation tracking
    cancelledAt: {
      type: Date,
      default: null,
    },
    cancellationReason: {
      type: String,
      default: null,
    },
    // Last payment info
    lastPaymentAt: {
      type: Date,
      default: null,
    },
    lastPaymentAmount: {
      type: Number,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// One active subscription per tenant
subscriptionSchema.index(
  { tenantId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ['trialing', 'active', 'past_due'] },
    },
  }
);

module.exports = mongoose.models.Subscription || mongoose.model('Subscription', subscriptionSchema);
