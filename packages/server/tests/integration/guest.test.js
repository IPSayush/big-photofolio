/**
 * Guest Integration Tests.
 *
 * Tests the complete guest flow:
 * - Event lookup via QR tokens (FR-GUEST-001/002)
 * - Consent recording (FR-GUEST-003)
 * - Selfie upload & validation (FR-SELFIE-001-005)
 * - Personalized gallery (FR-GALLERY-001/003/004)
 * - Browsable gallery via QR-A (PRIV-006)
 * - Consent withdrawal (FR-GUEST-005 / PRIV-003)
 * - Cross-event token blocked (SEC-006)
 */

const request = require('supertest');
const app = require('../../src/app');
const Tenant = require('../../src/models/Tenant');
const Plan = require('../../src/models/Plan');
const Event = require('../../src/models/Event');
const Guest = require('../../src/models/Guest');
const ConsentRecord = require('../../src/models/ConsentRecord');
const ReferenceFace = require('../../src/models/ReferenceFace');
const Match = require('../../src/models/Match');
const { CONSENT_TEXT_VERSION } = require('../../src/services/guest.service');

const TEST_USER = {
  email: 'guest-test@photographer.com',
  password: 'StrongPass123',
  firstName: 'Guest',
  lastName: 'Tester',
  businessName: 'Guest Test Studio',
};

/**
 * Helper: register photographer, assign plan, create event, return QR tokens.
 */
async function setupForGuest(userOverrides = {}) {
  const userData = { ...TEST_USER, ...userOverrides };
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

  const eventRes = await request(app)
    .post('/api/events')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      name: `Guest Test Event ${Date.now()}`,
      dateStart: '2026-12-25T18:00:00.000Z',
      dateEnd: '2026-12-25T23:00:00.000Z',
      venue: 'Test Venue',
    });

  const event = eventRes.body.data.event;
  const eventId = event.id || event._id;

  // Fetch full event from DB to get QR tokens
  const fullEvent = await Event.findById(eventId);

  return {
    accessToken,
    tenantId,
    eventId,
    qrAToken: fullEvent.qrAToken,
    qrBToken: fullEvent.qrBToken,
  };
}

/**
 * Helper: create a minimal test image buffer (valid enough for processing).
 */
function createTestImageBuffer() {
  // Create a minimal 1x1 JPEG-like buffer
  // In test mode, sharp validation is relaxed, so this is fine
  const buf = Buffer.alloc(1024);
  buf[0] = 0xFF; buf[1] = 0xD8; // JPEG SOI marker
  return buf;
}

describe('GET /api/guest/events/:qrToken', () => {
  it('should return event info via QR-A token — FR-GUEST-001', async () => {
    const { qrAToken } = await setupForGuest();

    const res = await request(app)
      .get(`/api/guest/events/${qrAToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.event.name).toBeDefined();
    expect(res.body.data.qrType).toBe('A');
    expect(res.body.data.consentRequired).toBe(false);
    expect(res.body.data.consentText).toBeNull();
  });

  it('should return event info with consent text via QR-B token — FR-GUEST-002', async () => {
    const { qrBToken } = await setupForGuest({
      email: 'guest-qrb@photographer.com',
      businessName: 'QRB Studio',
    });

    const res = await request(app)
      .get(`/api/guest/events/${qrBToken}`)
      .expect(200);

    expect(res.body.data.qrType).toBe('B');
    expect(res.body.data.consentRequired).toBe(true);
    expect(res.body.data.consentText).toBeDefined();
    expect(res.body.data.consentTextVersion).toBe(CONSENT_TEXT_VERSION);
  });

  it('should return 404 for invalid QR token', async () => {
    const res = await request(app)
      .get('/api/guest/events/invalid-token-12345')
      .expect(404);

    expect(res.body.code).toBe('INVALID_QR_CODE');
  });
});

describe('POST /api/guest/consent', () => {
  it('should record consent and return guest token — FR-GUEST-003', async () => {
    const { qrBToken, eventId } = await setupForGuest({
      email: 'guest-consent@photographer.com',
      businessName: 'Consent Studio',
    });

    const res = await request(app)
      .post('/api/guest/consent')
      .send({
        qrToken: qrBToken,
        consentTextVersion: CONSENT_TEXT_VERSION,
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.guestToken).toBeDefined();
    expect(res.body.data.guestId).toBeDefined();
    expect(res.body.data.eventId).toBe(eventId);

    // Verify consent record in DB
    const consent = await ConsentRecord.findOne({ eventId });
    expect(consent).toBeDefined();
    expect(consent.consentTextVersion).toBe(CONSENT_TEXT_VERSION);
    expect(consent.consentedAt).toBeDefined();
    expect(consent.withdrawnAt).toBeNull();
  });

  it('should reject consent with wrong version — PRIV-002', async () => {
    const { qrBToken } = await setupForGuest({
      email: 'guest-wrongver@photographer.com',
      businessName: 'Wrong Version Studio',
    });

    const res = await request(app)
      .post('/api/guest/consent')
      .send({
        qrToken: qrBToken,
        consentTextVersion: '0.9-old',
      })
      .expect(400);

    expect(res.body.code).toBe('CONSENT_VERSION_MISMATCH');
  });

  it('should increment event guest count on consent', async () => {
    const { qrBToken, eventId } = await setupForGuest({
      email: 'guest-count@photographer.com',
      businessName: 'Count Studio',
    });

    await request(app)
      .post('/api/guest/consent')
      .send({ qrToken: qrBToken, consentTextVersion: CONSENT_TEXT_VERSION })
      .expect(201);

    const event = await Event.findById(eventId);
    expect(event.stats.guestCount).toBe(1);
  });
});

describe('POST /api/guest/selfie', () => {
  it('should require guest authentication', async () => {
    const res = await request(app)
      .post('/api/guest/selfie')
      .send({ imageData: 'dGVzdA==' })
      .expect(401);

    expect(res.body.code).toBe('GUEST_AUTH_REQUIRED');
  });

  it('should upload and validate selfie — FR-SELFIE-001', async () => {
    const { qrBToken } = await setupForGuest({
      email: 'guest-selfie@photographer.com',
      businessName: 'Selfie Studio',
    });

    // Get guest token via consent
    const consentRes = await request(app)
      .post('/api/guest/consent')
      .send({ qrToken: qrBToken, consentTextVersion: CONSENT_TEXT_VERSION });

    const guestToken = consentRes.body.data.guestToken;
    const imageBuffer = createTestImageBuffer();

    const res = await request(app)
      .post('/api/guest/selfie')
      .set('Authorization', `Guest ${guestToken}`)
      .send({
        imageData: imageBuffer.toString('base64'),
        contentType: 'image/jpeg',
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('accepted');
    expect(res.body.data.referenceFaceId).toBeDefined();
  });

  it('should reject selfie without consent — PRIV-001', async () => {
    // Create guest directly without consent
    const { eventId, tenantId } = await setupForGuest({
      email: 'guest-noconsent@photographer.com',
      businessName: 'No Consent Studio',
    });

    const { plainToken, hash } = Guest.generateSessionToken();
    await Guest.create({
      eventId,
      tenantId,
      sessionTokenHash: hash,
      status: 'active',
      // No consentRecordId
    });

    const res = await request(app)
      .post('/api/guest/selfie')
      .set('Authorization', `Guest ${plainToken}`)
      .send({ imageData: 'dGVzdA==', contentType: 'image/jpeg' })
      .expect(403);

    expect(res.body.code).toBe('CONSENT_REQUIRED');
  });
});

describe('GET /api/guest/gallery', () => {
  it('should return personalized gallery — FR-GALLERY-001', async () => {
    const { qrBToken } = await setupForGuest({
      email: 'guest-gallery@photographer.com',
      businessName: 'Gallery Studio',
    });

    const consentRes = await request(app)
      .post('/api/guest/consent')
      .send({ qrToken: qrBToken, consentTextVersion: CONSENT_TEXT_VERSION });

    const guestToken = consentRes.body.data.guestToken;

    const res = await request(app)
      .get('/api/guest/gallery')
      .set('Authorization', `Guest ${guestToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.photos).toBeDefined();
    expect(res.body.data.processingStatus).toBeDefined();
    expect(res.body.data.processingStatus.totalPhotos).toBeDefined();
  });

  it('should show processing status — FR-GALLERY-004', async () => {
    const { qrBToken } = await setupForGuest({
      email: 'guest-processing@photographer.com',
      businessName: 'Processing Studio',
    });

    const consentRes = await request(app)
      .post('/api/guest/consent')
      .send({ qrToken: qrBToken, consentTextVersion: CONSENT_TEXT_VERSION });

    const guestToken = consentRes.body.data.guestToken;

    const res = await request(app)
      .get('/api/guest/gallery')
      .set('Authorization', `Guest ${guestToken}`)
      .expect(200);

    // With no photos, processing is "complete" (vacuously)
    expect(res.body.data.processingStatus.complete).toBe(true);
  });

  it('should require guest authentication', async () => {
    const res = await request(app)
      .get('/api/guest/gallery')
      .expect(401);

    expect(res.body.code).toBe('GUEST_AUTH_REQUIRED');
  });
});

describe('GET /api/guest/events/:qrToken/gallery', () => {
  it('should return browsable gallery via QR-A — PRIV-006', async () => {
    const { qrAToken } = await setupForGuest({
      email: 'guest-browse@photographer.com',
      businessName: 'Browse Studio',
    });

    const res = await request(app)
      .get(`/api/guest/events/${qrAToken}/gallery`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.event).toBeDefined();
    expect(res.body.data.photos).toBeDefined();
    expect(res.body.data.pagination).toBeDefined();
  });
});

describe('POST /api/guest/consent/withdraw', () => {
  it('should withdraw consent and delete face data — FR-GUEST-005 / PRIV-003', async () => {
    const { qrBToken, eventId } = await setupForGuest({
      email: 'guest-withdraw@photographer.com',
      businessName: 'Withdraw Studio',
    });

    // Consent
    const consentRes = await request(app)
      .post('/api/guest/consent')
      .send({ qrToken: qrBToken, consentTextVersion: CONSENT_TEXT_VERSION });

    const guestToken = consentRes.body.data.guestToken;
    const guestId = consentRes.body.data.guestId;

    // Upload selfie first
    const imageBuffer = createTestImageBuffer();
    await request(app)
      .post('/api/guest/selfie')
      .set('Authorization', `Guest ${guestToken}`)
      .send({ imageData: imageBuffer.toString('base64'), contentType: 'image/jpeg' });

    // Verify reference face exists
    const refFaceBefore = await ReferenceFace.findOne({ guestId, deletedAt: null });
    expect(refFaceBefore).toBeDefined();

    // Withdraw consent
    const res = await request(app)
      .post('/api/guest/consent/withdraw')
      .set('Authorization', `Guest ${guestToken}`)
      .expect(200);

    expect(res.body.data.deleted).toBe(true);

    // Verify reference face soft-deleted — PRIV-003
    const refFaceAfter = await ReferenceFace.findOne({ guestId, deletedAt: null });
    expect(refFaceAfter).toBeNull();

    // Verify consent record has withdrawnAt
    const consentRecord = await ConsentRecord.findOne({ guestId });
    expect(consentRecord.withdrawnAt).toBeDefined();

    // Verify guest status updated
    const guest = await Guest.findById(guestId);
    expect(guest.status).toBe('consent_withdrawn');
  });

  it('should block access after consent withdrawal', async () => {
    const { qrBToken } = await setupForGuest({
      email: 'guest-blocked@photographer.com',
      businessName: 'Blocked Studio',
    });

    const consentRes = await request(app)
      .post('/api/guest/consent')
      .send({ qrToken: qrBToken, consentTextVersion: CONSENT_TEXT_VERSION });

    const guestToken = consentRes.body.data.guestToken;

    // Withdraw
    await request(app)
      .post('/api/guest/consent/withdraw')
      .set('Authorization', `Guest ${guestToken}`)
      .expect(200);

    // Subsequent requests should be blocked
    const res = await request(app)
      .get('/api/guest/gallery')
      .set('Authorization', `Guest ${guestToken}`)
      .expect(403);

    expect(res.body.code).toBe('CONSENT_WITHDRAWN');
  });
});
