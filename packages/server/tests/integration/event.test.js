/**
 * Event Integration Tests.
 *
 * Tests event management via HTTP:
 * - Create event with dual QR codes (FR-EVENT-001/002)
 * - Quota enforcement from Plan config (FR-PLAN-003)
 * - List/get events with tenant isolation (SEC-001/SEC-002)
 * - Update event access mode (FR-EVENT-004)
 * - Archive event (FR-EVENT-005)
 * - Regenerate QR code (FR-EVENT-003)
 * - Event dashboard stats shape (FR-EVENT-006)
 * - Cross-tenant access blocked (SEC-001)
 */

const request = require('supertest');
const app = require('../../src/app');
const Tenant = require('../../src/models/Tenant');
const Plan = require('../../src/models/Plan');
const Event = require('../../src/models/Event');
const AuditLog = require('../../src/models/AuditLog');

const TEST_USER = {
  email: 'event-test@photographer.com',
  password: 'StrongPass123',
  firstName: 'Alex',
  lastName: 'Photo',
  businessName: 'Alex Photo Studio',
};

const TEST_EVENT = {
  name: 'Wedding Reception',
  dateStart: '2026-12-25T18:00:00.000Z',
  dateEnd: '2026-12-25T23:00:00.000Z',
  venue: 'Grand Ballroom, Mumbai',
  accessMode: 'link_only',
};

/**
 * Helper: register a user, assign a plan, and return tokens.
 */
async function registerWithPlan(userData = TEST_USER, planOverrides = {}) {
  const res = await request(app).post('/api/auth/register').send(userData);
  const accessToken = res.body.data.tokens.accessToken;
  const tenantId = res.body.data.tenant.id || res.body.data.tenant._id;

  // Create and assign a plan
  const plan = await Plan.create({
    name: `Plan-${Date.now()}`,
    pricing: { amount: 999, currency: 'INR', interval: 'monthly' },
    quotas: {
      maxEvents: 10,
      maxPhotosPerEvent: 500,
      maxStorageBytes: 5368709120,
      maxGuestsPerEvent: 100,
      maxAiMatchesPerMonth: 1000,
      ...planOverrides,
    },
  });
  await Tenant.findByIdAndUpdate(tenantId, { planId: plan._id });

  return { accessToken, tenantId, plan };
}

describe('POST /api/events', () => {
  it('should create event with dual QR codes — FR-EVENT-001/002', async () => {
    const { accessToken } = await registerWithPlan();

    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(TEST_EVENT)
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.event).toBeDefined();
    expect(res.body.data.event.name).toBe(TEST_EVENT.name);
    expect(res.body.data.event.venue).toBe(TEST_EVENT.venue);
    expect(res.body.data.event.accessMode).toBe('link_only');

    // FR-EVENT-002: Two distinct, non-guessable QR tokens
    expect(res.body.data.event.qrAToken).toBeDefined();
    expect(res.body.data.event.qrBToken).toBeDefined();
    expect(res.body.data.event.qrAToken).toHaveLength(64); // 32 bytes hex
    expect(res.body.data.event.qrBToken).toHaveLength(64);
    expect(res.body.data.event.qrAToken).not.toBe(res.body.data.event.qrBToken);

    // FR-EVENT-006: Stats initialized to zero
    expect(res.body.data.event.stats.guestCount).toBe(0);
    expect(res.body.data.event.stats.photoCount).toBe(0);
    expect(res.body.data.event.stats.matchCount).toBe(0);
    expect(res.body.data.event.stats.storageUsedBytes).toBe(0);
  });

  it('should enforce maxEvents quota from Plan config — FR-PLAN-003', async () => {
    // Plan with maxEvents = 1 (read from config, not hardcoded)
    const { accessToken } = await registerWithPlan(TEST_USER, { maxEvents: 1 });

    // First event should succeed
    await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(TEST_EVENT)
      .expect(201);

    // Second event should be rejected by quota
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ...TEST_EVENT, name: 'Second Event' })
      .expect(403);

    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('EVENT_QUOTA_EXCEEDED');
  });

  it('should create audit log on event creation — SEC-007', async () => {
    const { accessToken } = await registerWithPlan();

    await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(TEST_EVENT)
      .expect(201);

    const auditLogs = await AuditLog.find({
      action: 'event.create',
      targetType: 'Event',
    });
    expect(auditLogs.length).toBe(1);
    expect(auditLogs[0].metadata.eventName).toBe(TEST_EVENT.name);
  });

  it('should reject missing required fields', async () => {
    const { accessToken } = await registerWithPlan();

    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ venue: 'Somewhere' }) // Missing name and dateStart
      .expect(400);

    expect(res.body.success).toBe(false);
  });

  it('should reject unauthenticated access — SEC-001', async () => {
    await request(app)
      .post('/api/events')
      .send(TEST_EVENT)
      .expect(401);
  });
});

describe('GET /api/events', () => {
  it('should list events for the authenticated tenant', async () => {
    const { accessToken } = await registerWithPlan();

    // Create two events
    await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(TEST_EVENT);
    await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ...TEST_EVENT, name: 'Birthday Party' });

    const res = await request(app)
      .get('/api/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.events).toHaveLength(2);
    expect(res.body.data.pagination.total).toBe(2);
  });

  it('should not show events from another tenant — SEC-001/SEC-002', async () => {
    // Tenant A creates an event
    const tenantA = await registerWithPlan();
    await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send(TEST_EVENT);

    // Tenant B should see zero events
    const tenantB = await registerWithPlan({
      ...TEST_USER,
      email: 'tenant-b@photographer.com',
      businessName: 'Tenant B Studio',
    });

    const res = await request(app)
      .get('/api/events')
      .set('Authorization', `Bearer ${tenantB.accessToken}`)
      .expect(200);

    expect(res.body.data.events).toHaveLength(0);
    expect(res.body.data.pagination.total).toBe(0);
  });
});

describe('GET /api/events/:eventId', () => {
  it('should return event with dashboard stats — FR-EVENT-006', async () => {
    const { accessToken } = await registerWithPlan();

    const createRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(TEST_EVENT);
    const eventId = createRes.body.data.event.id || createRes.body.data.event._id;

    const res = await request(app)
      .get(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.data.event.name).toBe(TEST_EVENT.name);
    expect(res.body.data.event.stats).toBeDefined();
    expect(res.body.data.event.qrAToken).toBeDefined();
    expect(res.body.data.event.qrBToken).toBeDefined();
  });

  it('should not return another tenant\'s event — SEC-001', async () => {
    const tenantA = await registerWithPlan();
    const createRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send(TEST_EVENT);
    const eventId = createRes.body.data.event.id || createRes.body.data.event._id;

    const tenantB = await registerWithPlan({
      ...TEST_USER,
      email: 'cross-tenant@photographer.com',
      businessName: 'Cross Tenant Studio',
    });

    // Tenant B tries to access Tenant A's event
    await request(app)
      .get(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${tenantB.accessToken}`)
      .expect(404);
  });
});

describe('PATCH /api/events/:eventId', () => {
  it('should update event access mode — FR-EVENT-004', async () => {
    const { accessToken } = await registerWithPlan();

    const createRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(TEST_EVENT);
    const eventId = createRes.body.data.event.id || createRes.body.data.event._id;

    const res = await request(app)
      .patch(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ accessMode: 'find_my_photos_only' })
      .expect(200);

    expect(res.body.data.event.accessMode).toBe('find_my_photos_only');
  });

  it('should reject update on archived event', async () => {
    const { accessToken } = await registerWithPlan();

    const createRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(TEST_EVENT);
    const eventId = createRes.body.data.event.id || createRes.body.data.event._id;

    // Archive first
    await request(app)
      .post(`/api/events/${eventId}/archive`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    // Try to update
    const res = await request(app)
      .patch(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'New Name' })
      .expect(400);

    expect(res.body.code).toBe('EVENT_ARCHIVED');
  });
});

describe('POST /api/events/:eventId/qr/regenerate', () => {
  it('should regenerate QR-A token — FR-EVENT-003', async () => {
    const { accessToken } = await registerWithPlan();

    const createRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(TEST_EVENT);
    const eventId = createRes.body.data.event.id || createRes.body.data.event._id;
    const originalQrA = createRes.body.data.event.qrAToken;

    const res = await request(app)
      .post(`/api/events/${eventId}/qr/regenerate`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ qrType: 'A' })
      .expect(200);

    expect(res.body.data.event.qrAToken).not.toBe(originalQrA);
    expect(res.body.data.event.qrAToken).toHaveLength(64);
    // QR-B should remain unchanged
    expect(res.body.data.event.qrBToken).toBe(createRes.body.data.event.qrBToken);
  });

  it('should regenerate QR-B token — FR-EVENT-003', async () => {
    const { accessToken } = await registerWithPlan();

    const createRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(TEST_EVENT);
    const eventId = createRes.body.data.event.id || createRes.body.data.event._id;
    const originalQrB = createRes.body.data.event.qrBToken;

    const res = await request(app)
      .post(`/api/events/${eventId}/qr/regenerate`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ qrType: 'B' })
      .expect(200);

    expect(res.body.data.event.qrBToken).not.toBe(originalQrB);
    // QR-A should remain unchanged
    expect(res.body.data.event.qrAToken).toBe(createRes.body.data.event.qrAToken);
  });

  it('should audit-log QR regeneration — SEC-007', async () => {
    const { accessToken } = await registerWithPlan();

    const createRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(TEST_EVENT);
    const eventId = createRes.body.data.event.id || createRes.body.data.event._id;

    await request(app)
      .post(`/api/events/${eventId}/qr/regenerate`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ qrType: 'A' })
      .expect(200);

    const auditLogs = await AuditLog.find({ action: 'event.regenerate_qr' });
    expect(auditLogs.length).toBe(1);
    expect(auditLogs[0].metadata.qrType).toBe('A');
  });
});

describe('POST /api/events/:eventId/archive', () => {
  it('should archive event — FR-EVENT-005', async () => {
    const { accessToken } = await registerWithPlan();

    const createRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(TEST_EVENT);
    const eventId = createRes.body.data.event.id || createRes.body.data.event._id;

    const res = await request(app)
      .post(`/api/events/${eventId}/archive`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.data.event.status).toBe('archived');
  });

  it('should reject archiving an already archived event', async () => {
    const { accessToken } = await registerWithPlan();

    const createRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(TEST_EVENT);
    const eventId = createRes.body.data.event.id || createRes.body.data.event._id;

    // Archive once
    await request(app)
      .post(`/api/events/${eventId}/archive`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    // Try again
    const res = await request(app)
      .post(`/api/events/${eventId}/archive`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(400);

    expect(res.body.code).toBe('ALREADY_ARCHIVED');
  });

  it('should reject QR regeneration on archived event — FR-EVENT-003', async () => {
    const { accessToken } = await registerWithPlan();

    const createRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(TEST_EVENT);
    const eventId = createRes.body.data.event.id || createRes.body.data.event._id;

    await request(app)
      .post(`/api/events/${eventId}/archive`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const res = await request(app)
      .post(`/api/events/${eventId}/qr/regenerate`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ qrType: 'B' })
      .expect(400);

    expect(res.body.code).toBe('EVENT_ARCHIVED');
  });
});
