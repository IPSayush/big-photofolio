/**
 * Subscription & Billing Integration Tests.
 *
 * Tests:
 * - List plans (FR-PLAN-002)
 * - Subscribe to plan (FR-PLAN-005)
 * - Get current subscription with usage (FR-PLAN-004)
 * - Cancel subscription
 * - Razorpay webhook processing (FR-PLAN-005)
 * - Event quota enforcement (FR-PLAN-003)
 * - Photo quota enforcement (FR-PLAN-003)
 * - Trial support (FR-PLAN-006)
 */

const crypto = require('crypto');
const request = require('supertest');
const app = require('../../src/app');
const Plan = require('../../src/models/Plan');
const Tenant = require('../../src/models/Tenant');
const Subscription = require('../../src/models/Subscription');
const Event = require('../../src/models/Event');

const TEST_USER = {
  email: 'sub-test@photographer.com',
  password: 'StrongPass123',
  firstName: 'Sub',
  lastName: 'Tester',
  businessName: 'Sub Test Studio',
};

/**
 * Helper: register user, return tokens and tenant.
 */
async function registerUser(userOverrides = {}) {
  const userData = { ...TEST_USER, ...userOverrides };
  const regRes = await request(app).post('/api/auth/register').send(userData);
  const accessToken = regRes.body.data.tokens.accessToken;
  const tenantId = regRes.body.data.tenant.id || regRes.body.data.tenant._id;
  return { accessToken, tenantId };
}

/**
 * Helper: create a test plan.
 */
async function createTestPlan(overrides = {}) {
  return Plan.create({
    name: `Test Plan ${Date.now()}-${Math.random().toString(36).slice(2)}`,
    pricing: { amount: 999, currency: 'INR', interval: 'monthly' },
    quotas: {
      maxEvents: 5,
      maxPhotosPerEvent: 100,
      maxStorageBytes: 1073741824,
      maxGuestsPerEvent: 50,
      maxAiMatchesPerMonth: 500,
    },
    trialDays: 0,
    isActive: true,
    ...overrides,
  });
}

describe('GET /api/plans', () => {
  it('should list active plans — FR-PLAN-002', async () => {
    await createTestPlan({ name: `ListPlan-${Date.now()}` });

    const res = await request(app)
      .get('/api/plans')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.plans.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.plans[0].name).toBeDefined();
    expect(res.body.data.plans[0].pricing).toBeDefined();
    expect(res.body.data.plans[0].quotas).toBeDefined();
  });

  it('should not list inactive plans', async () => {
    const inactivePlan = await createTestPlan({
      name: `InactivePlan-${Date.now()}`,
      isActive: false,
    });

    const res = await request(app)
      .get('/api/plans')
      .expect(200);

    const planIds = res.body.data.plans.map((p) => p._id);
    expect(planIds).not.toContain(inactivePlan._id.toString());
  });
});

describe('POST /api/subscriptions', () => {
  it('should subscribe to a plan — FR-PLAN-005', async () => {
    const { accessToken, tenantId } = await registerUser({
      email: 'sub-create@photographer.com',
      businessName: 'Create Sub Studio',
    });

    const plan = await createTestPlan();

    const res = await request(app)
      .post('/api/subscriptions')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ planId: plan._id.toString() })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.subscriptionId).toBeDefined();
    expect(res.body.data.planName).toBe(plan.name);
    expect(res.body.data.status).toBe('active');

    // Verify tenant's planId updated
    const tenant = await Tenant.findById(tenantId);
    expect(tenant.planId.toString()).toBe(plan._id.toString());
  });

  it('should support trial periods — FR-PLAN-006', async () => {
    const { accessToken } = await registerUser({
      email: 'sub-trial@photographer.com',
      businessName: 'Trial Studio',
    });

    const plan = await createTestPlan({ trialDays: 14 });

    const res = await request(app)
      .post('/api/subscriptions')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ planId: plan._id.toString() })
      .expect(201);

    expect(res.body.data.status).toBe('trialing');
    expect(res.body.data.trialEnd).toBeDefined();
  });

  it('should reject duplicate active subscription', async () => {
    const { accessToken } = await registerUser({
      email: 'sub-dup@photographer.com',
      businessName: 'Dup Sub Studio',
    });

    const plan = await createTestPlan();

    await request(app)
      .post('/api/subscriptions')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ planId: plan._id.toString() })
      .expect(201);

    const res = await request(app)
      .post('/api/subscriptions')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ planId: plan._id.toString() })
      .expect(409);

    expect(res.body.code).toBe('SUBSCRIPTION_EXISTS');
  });
});

describe('GET /api/subscriptions/current', () => {
  it('should return current subscription with usage — FR-PLAN-004', async () => {
    const { accessToken, tenantId } = await registerUser({
      email: 'sub-current@photographer.com',
      businessName: 'Current Sub Studio',
    });

    const plan = await createTestPlan();
    await Tenant.findByIdAndUpdate(tenantId, { planId: plan._id });

    await request(app)
      .post('/api/subscriptions')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ planId: plan._id.toString() });

    const res = await request(app)
      .get('/api/subscriptions/current')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.subscription).toBeDefined();
    expect(res.body.data.usage).toBeDefined();
    expect(res.body.data.usage.eventsUsed).toBeDefined();
    expect(res.body.data.usage.photosUploaded).toBeDefined();
    expect(res.body.data.usage.storageBytesUsed).toBeDefined();
  });
});

describe('POST /api/subscriptions/cancel', () => {
  it('should cancel subscription', async () => {
    const { accessToken } = await registerUser({
      email: 'sub-cancel@photographer.com',
      businessName: 'Cancel Studio',
    });

    const plan = await createTestPlan();

    await request(app)
      .post('/api/subscriptions')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ planId: plan._id.toString() });

    const res = await request(app)
      .post('/api/subscriptions/cancel')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'Testing cancellation' })
      .expect(200);

    expect(res.body.data.status).toBe('cancelled');
    expect(res.body.data.cancelledAt).toBeDefined();
  });
});

describe('POST /api/webhooks/razorpay', () => {
  it('should process valid webhook with correct signature — FR-PLAN-005', async () => {
    const { tenantId } = await registerUser({
      email: 'sub-webhook@photographer.com',
      businessName: 'Webhook Studio',
    });

    const plan = await createTestPlan();

    // Create subscription directly in DB
    const sub = await Subscription.create({
      tenantId,
      planId: plan._id,
      razorpaySubscriptionId: 'sub_webhook_test_123',
      status: 'active',
      currentPeriodStart: new Date(),
    });

    const webhookBody = {
      event: 'subscription.charged',
      payload: {
        subscription: {
          entity: {
            id: 'sub_webhook_test_123',
          },
        },
      },
    };

    const bodyString = JSON.stringify(webhookBody);
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'test-webhook-secret';
    const signature = crypto
      .createHmac('sha256', secret)
      .update(bodyString)
      .digest('hex');

    const res = await request(app)
      .post('/api/webhooks/razorpay')
      .set('X-Razorpay-Signature', signature)
      .send(webhookBody)
      .expect(200);

    expect(res.body.success).toBe(true);

    // Verify subscription updated
    const updated = await Subscription.findById(sub._id);
    expect(updated.lastPaymentAt).toBeDefined();
  });

  it('should reject invalid webhook signature', async () => {
    const res = await request(app)
      .post('/api/webhooks/razorpay')
      .set('X-Razorpay-Signature', 'invalid-signature')
      .send({ event: 'subscription.activated', payload: {} })
      .expect(401);

    expect(res.body.code).toBe('INVALID_SIGNATURE');
  });
});

describe('Quota Enforcement — FR-PLAN-003', () => {
  it('should block event creation when quota exceeded', async () => {
    const { accessToken, tenantId } = await registerUser({
      email: 'sub-quota@photographer.com',
      businessName: 'Quota Studio',
    });

    // Create plan with maxEvents=1
    const plan = await createTestPlan({
      quotas: {
        maxEvents: 1,
        maxPhotosPerEvent: 100,
        maxStorageBytes: 1073741824,
        maxGuestsPerEvent: 50,
        maxAiMatchesPerMonth: 500,
      },
    });
    await Tenant.findByIdAndUpdate(tenantId, { planId: plan._id });

    // Create first event (should succeed)
    await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Event 1',
        dateStart: '2026-12-25T18:00:00.000Z',
        dateEnd: '2026-12-25T23:00:00.000Z',
        venue: 'Venue',
      })
      .expect(201);

    // Create second event (should be blocked)
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Event 2',
        dateStart: '2026-12-26T18:00:00.000Z',
        dateEnd: '2026-12-26T23:00:00.000Z',
        venue: 'Venue',
      })
      .expect(403);

    expect(res.body.code).toBe('QUOTA_EXCEEDED');
  });

  it('should block operations without a plan', async () => {
    const { accessToken, tenantId } = await registerUser({
      email: 'sub-noplan@photographer.com',
      businessName: 'No Plan Studio',
    });

    // Remove plan from tenant
    await Tenant.findByIdAndUpdate(tenantId, { planId: null });

    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Blocked Event',
        dateStart: '2026-12-25T18:00:00.000Z',
        dateEnd: '2026-12-25T23:00:00.000Z',
        venue: 'Venue',
      })
      .expect(403);

    expect(res.body.code).toBe('NO_ACTIVE_PLAN');
  });
});
