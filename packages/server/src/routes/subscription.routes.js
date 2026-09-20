/**
 * Subscription Routes — plan listing, subscription management, webhooks.
 * FR-PLAN-002/004/005.
 */

const express = require('express');
const router = express.Router();
const subController = require('../controllers/subscription.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { enforceTenantScope } = require('../middleware/tenantScope');
const { ROLES } = require('@photofolio/shared');

// Public — list available plans (FR-PLAN-002)
router.get('/plans', subController.listPlans);

// Photographer — subscribe to a plan
router.post('/subscriptions', authenticate, authorize(ROLES.PHOTOGRAPHER), enforceTenantScope, subController.subscribe);

// Photographer — current subscription + usage (FR-PLAN-004)
router.get('/subscriptions/current', authenticate, authorize(ROLES.PHOTOGRAPHER), enforceTenantScope, subController.getCurrentSubscription);

// Photographer — cancel subscription
router.post('/subscriptions/cancel', authenticate, authorize(ROLES.PHOTOGRAPHER), enforceTenantScope, subController.cancelSubscription);

// Razorpay webhook — public but signature-verified (FR-PLAN-005)
router.post('/webhooks/razorpay', subController.handleWebhook);

module.exports = router;
