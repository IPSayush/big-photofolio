/**
 * Dashboard & Monitoring Integration Tests.
 *
 * Tests:
 * - Photographer dashboard (FR-MON-001)
 * - Admin dashboard (FR-MON-002)
 * - Admin suspend/reinstate tenant (FR-MON-003)
 * - Admin suspend event (FR-MON-003)
 */

const request = require('supertest');
const app = require('../../src/app');
const Plan = require('../../src/models/Plan');
const Tenant = require('../../src/models/Tenant');
const Event = require('../../src/models/Event');
const User = require('../../src/models/User');
const AuditLog = require('../../src/models/AuditLog');
const { ROLES } = require('@photofolio/shared');

const TEST_USER = {
  email: 'dash-test@photographer.com',
  password: 'StrongPass123',
  firstName: 'Dash',
  lastName: 'Tester',
  businessName: 'Dash Studio',
};

/**
 * Helper: register photographer with plan and event.
 */
async function setupPhotographer(overrides = {}) {
  const userData = { ...TEST_USER, ...overrides };
  const regRes = await request(app).post('/api/auth/register').send(userData);
  const accessToken = regRes.body.data.tokens.accessToken;
  const tenantId = regRes.body.data.tenant.id || regRes.body.data.tenant._id;

  const plan = await Plan.create({
    name: `Plan-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    pricing: { amount: 999, currency: 'INR', interval: 'monthly' },
    quotas: {
      maxEvents: 10,
      maxPhotosPerEvent: 500,
      maxStorageBytes: 5368709120,
      maxGuestsPerEvent: 100,
      maxAiMatchesPerMonth: 1000,
    },
  });
  await Tenant.findByIdAndUpdate(tenantId, { planId: plan._id });

  // Create an event
  const eventRes = await request(app)
    .post('/api/events')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      name: `Dashboard Event ${Date.now()}`,
      dateStart: '2026-12-25T18:00:00.000Z',
      dateEnd: '2026-12-25T23:00:00.000Z',
      venue: 'Test Venue',
    });

  const event = eventRes.body.data.event;

  return { accessToken, tenantId, plan, eventId: event.id || event._id };
}

/**
 * Helper: create an admin user and return token.
 */
async function createAdmin() {
  const regRes = await request(app).post('/api/auth/register').send({
    email: `admin-${Date.now()}@photofolio.admin`,
    password: 'AdminPass123',
    firstName: 'Admin',
    lastName: 'User',
    businessName: 'Admin Corp',
  });

  const accessToken = regRes.body.data.tokens.accessToken;
  const userId = regRes.body.data.user.id || regRes.body.data.user._id;

  // Promote to admin role directly in DB
  await User.findByIdAndUpdate(userId, { role: ROLES.ADMIN });

  // Re-login to get a token with refreshed DB state
  // (auth middleware re-verifies role from DB, so existing token works)
  return { accessToken, userId };
}

describe('GET /api/dashboard — Photographer Dashboard', () => {
  it('should return per-event stats and quota — FR-MON-001', async () => {
    const { accessToken } = await setupPhotographer({
      email: 'dash-photo@photographer.com',
      businessName: 'Photo Dash Studio',
    });

    const res = await request(app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.totals).toBeDefined();
    expect(res.body.data.totals.events).toBeGreaterThanOrEqual(1);
    expect(res.body.data.totals.totalPhotos).toBeDefined();
    expect(res.body.data.totals.totalGuests).toBeDefined();
    expect(res.body.data.totals.totalMatches).toBeDefined();
    expect(res.body.data.totals.totalStorageBytes).toBeDefined();
    expect(res.body.data.events).toBeDefined();
    expect(res.body.data.events.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.plan).toBeDefined();
    expect(res.body.data.quotaRemaining).toBeDefined();
  });

  it('should require photographer auth', async () => {
    await request(app)
      .get('/api/dashboard')
      .expect(401);
  });
});

describe('GET /api/admin/dashboard — Admin Dashboard', () => {
  it('should return platform-wide stats — FR-MON-002', async () => {
    // Create some data first
    await setupPhotographer({
      email: 'dash-admin1@photographer.com',
      businessName: 'Admin Dash Studio 1',
    });

    const { accessToken } = await createAdmin();

    const res = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.platform).toBeDefined();
    expect(res.body.data.platform.totalTenants).toBeGreaterThanOrEqual(1);
    expect(res.body.data.platform.activeTenants).toBeDefined();
    expect(res.body.data.platform.totalEvents).toBeDefined();
    expect(res.body.data.platform.totalPhotos).toBeDefined();
    expect(res.body.data.tenants).toBeDefined();
    expect(res.body.data.pagination).toBeDefined();
  });

  it('should reject non-admin access — FR-AUTH-003', async () => {
    const { accessToken } = await setupPhotographer({
      email: 'dash-nonadmin@photographer.com',
      businessName: 'Non Admin Studio',
    });

    const res = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    expect(res.body.code).toBe('INSUFFICIENT_ROLE');
  });
});

describe('POST /api/admin/tenants/:tenantId/suspend — FR-MON-003', () => {
  it('should suspend a tenant', async () => {
    const { tenantId } = await setupPhotographer({
      email: 'dash-suspend@photographer.com',
      businessName: 'Suspend Studio',
    });

    const { accessToken: adminToken } = await createAdmin();

    const res = await request(app)
      .post(`/api/admin/tenants/${tenantId}/suspend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Abuse detected' })
      .expect(200);

    expect(res.body.data.status).toBe('suspended');
    expect(res.body.data.reason).toBe('Abuse detected');

    // Verify audit log
    const audit = await AuditLog.findOne({ action: 'tenant.suspended', targetId: tenantId });
    expect(audit).toBeDefined();
  });

  it('should require reason for suspension', async () => {
    const { tenantId } = await setupPhotographer({
      email: 'dash-noreason@photographer.com',
      businessName: 'No Reason Studio',
    });

    const { accessToken: adminToken } = await createAdmin();

    const res = await request(app)
      .post(`/api/admin/tenants/${tenantId}/suspend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(400);

    expect(res.body.code).toBe('MISSING_REASON');
  });
});

describe('POST /api/admin/tenants/:tenantId/reinstate — FR-MON-003', () => {
  it('should reinstate a suspended tenant', async () => {
    const { tenantId } = await setupPhotographer({
      email: 'dash-reinstate@photographer.com',
      businessName: 'Reinstate Studio',
    });

    const { accessToken: adminToken } = await createAdmin();

    // Suspend first
    await request(app)
      .post(`/api/admin/tenants/${tenantId}/suspend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Testing' });

    // Reinstate
    const res = await request(app)
      .post(`/api/admin/tenants/${tenantId}/reinstate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data.status).toBe('active');

    // Verify audit log
    const audit = await AuditLog.findOne({ action: 'tenant.reinstated', targetId: tenantId });
    expect(audit).toBeDefined();
  });
});

describe('POST /api/admin/events/:eventId/suspend — FR-MON-003', () => {
  it('should suspend an event', async () => {
    const { eventId } = await setupPhotographer({
      email: 'dash-eventsuspend@photographer.com',
      businessName: 'Event Suspend Studio',
    });

    const { accessToken: adminToken } = await createAdmin();

    const res = await request(app)
      .post(`/api/admin/events/${eventId}/suspend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Inappropriate content' })
      .expect(200);

    expect(res.body.data.status).toBe('closed');
    expect(res.body.data.reason).toBe('Inappropriate content');
  });
});
