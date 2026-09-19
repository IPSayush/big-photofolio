/**
 * Face Detection & Matching Integration Tests.
 *
 * Tests:
 * - FaceDetection model CRUD (event-scoped — SEC-006)
 * - ReferenceFace model CRUD
 * - Match model with confidence scores (FR-MATCH-005)
 * - Matching service: cosine similarity, threshold filtering (FR-MATCH-002)
 * - Cross-event face query blocked (SEC-006 / FR-MATCH-001)
 * - Match stats for photographer dashboard (FR-MON-001)
 */

const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../../src/app');
const FaceDetection = require('../../src/models/FaceDetection');
const ReferenceFace = require('../../src/models/ReferenceFace');
const Match = require('../../src/models/Match');
const Event = require('../../src/models/Event');
const Photo = require('../../src/models/Photo');
const Plan = require('../../src/models/Plan');
const Tenant = require('../../src/models/Tenant');
const {
  cosineSimilarity,
  findMatchesForGuest,
  getMatchesForGuest,
  getMatchStats,
} = require('../../src/services/matching.service');

const TEST_USER = {
  email: 'face-test@photographer.com',
  password: 'StrongPass123',
  firstName: 'Face',
  lastName: 'Tester',
  businessName: 'Face Test Studio',
};

/**
 * Helper: register user, assign plan, create event, return IDs.
 */
async function setupForFace(userOverrides = {}) {
  const userData = { ...TEST_USER, ...userOverrides };
  const regRes = await request(app).post('/api/auth/register').send(userData);
  const accessToken = regRes.body.data.tokens.accessToken;
  const tenantId = regRes.body.data.tenant.id || regRes.body.data.tenant._id;

  // Create and assign a plan (required for event creation quota check)
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
      name: `Face Test Event ${Date.now()}`,
      dateStart: '2026-12-25T18:00:00.000Z',
      dateEnd: '2026-12-25T23:00:00.000Z',
      venue: 'Test Venue',
    });

  const eventId = eventRes.body.data.event.id || eventRes.body.data.event._id;

  return { accessToken, tenantId, eventId };
}

/**
 * Helper: create a test photo in the DB.
 */
async function createTestPhoto(tenantId, eventId) {
  return Photo.create({
    tenantId,
    eventId,
    s3OriginalKey: `tenants/${tenantId}/events/${eventId}/originals/${new mongoose.Types.ObjectId()}.jpeg`,
    status: 'processed',
    originalFileName: 'test.jpg',
    contentType: 'image/jpeg',
    sizeBytes: 1024,
    hash: `hash-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    uploadBatchId: `batch-${Date.now()}`,
    uploadConfirmed: true,
  });
}

/**
 * Helper: generate a normalized embedding vector of given dimension.
 */
function generateEmbedding(seed = 42, dimensions = 128) {
  const vector = new Array(dimensions);
  for (let i = 0; i < dimensions; i++) {
    vector[i] = Math.sin(seed * (i + 1)) * 0.5;
  }
  // L2-normalize
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  return vector.map((v) => v / magnitude);
}

describe('FaceDetection Model — SEC-006', () => {
  it('should create face detection records for a photo', async () => {
    const { tenantId, eventId } = await setupForFace();
    const photo = await createTestPhoto(tenantId, eventId);
    const embedding = generateEmbedding(1);

    const fd = await FaceDetection.create({
      photoId: photo._id,
      eventId,
      tenantId,
      boundingBox: { x: 0.2, y: 0.15, width: 0.3, height: 0.35 },
      confidence: 0.95,
      qualityScore: 0.9,
      embedding,
      embeddingDimensions: 128,
      provider: 'mock',
    });

    expect(fd._id).toBeDefined();
    expect(fd.photoId.toString()).toBe(photo._id.toString());
    expect(fd.eventId.toString()).toBe(eventId.toString());
    expect(fd.confidence).toBe(0.95);
    expect(fd.provider).toBe('mock');
  });

  it('should not return embedding by default — NFR-PRIV-001', async () => {
    const { tenantId, eventId } = await setupForFace({
      email: 'face-noselect@photographer.com',
      businessName: 'No Select Studio',
    });
    const photo = await createTestPhoto(tenantId, eventId);
    const embedding = generateEmbedding(2);

    await FaceDetection.create({
      photoId: photo._id,
      eventId,
      tenantId,
      boundingBox: { x: 0.2, y: 0.15, width: 0.3, height: 0.35 },
      confidence: 0.95,
      qualityScore: 0.9,
      embedding,
      embeddingDimensions: 128,
      provider: 'mock',
    });

    // Default query should NOT include embedding
    const found = await FaceDetection.findOne({ eventId });
    expect(found.embedding).toBeUndefined();

    // Explicit select should include it
    const withEmbed = await FaceDetection.findOne({ eventId }).select('+embedding');
    expect(withEmbed.embedding).toHaveLength(128);
  });
});

describe('Cosine Similarity', () => {
  it('should return 1 for identical vectors', () => {
    const v = generateEmbedding(10);
    // Cosine similarity mapped to [0,1]: identical = 1
    const sim = cosineSimilarity(v, v);
    expect(sim).toBeCloseTo(1.0, 4);
  });

  it('should return lower similarity for different vectors', () => {
    const v1 = generateEmbedding(10);
    const v2 = generateEmbedding(99);
    const sim = cosineSimilarity(v1, v2);
    expect(sim).toBeLessThan(1.0);
    expect(sim).toBeGreaterThanOrEqual(0);
  });

  it('should return 0 for zero-length vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });
});

describe('Matching Service — FR-MATCH-001/002/005', () => {
  it('should find matches above threshold — FR-MATCH-002', async () => {
    const { tenantId, eventId } = await setupForFace({
      email: 'match-test@photographer.com',
      businessName: 'Match Test Studio',
    });

    // Create photos with face detections
    const photo1 = await createTestPhoto(tenantId, eventId);
    const photo2 = await createTestPhoto(tenantId, eventId);
    const embedding1 = generateEmbedding(42);
    const embedding2 = generateEmbedding(99);

    await FaceDetection.create({
      photoId: photo1._id,
      eventId,
      tenantId,
      boundingBox: { x: 0.2, y: 0.15, width: 0.3, height: 0.35 },
      confidence: 0.95,
      qualityScore: 0.9,
      embedding: embedding1,
      embeddingDimensions: 128,
      provider: 'mock',
    });

    await FaceDetection.create({
      photoId: photo2._id,
      eventId,
      tenantId,
      boundingBox: { x: 0.25, y: 0.2, width: 0.3, height: 0.35 },
      confidence: 0.92,
      qualityScore: 0.88,
      embedding: embedding2,
      embeddingDimensions: 128,
      provider: 'mock',
    });

    // Guest embedding = same as photo1 (should match with high confidence)
    const guestId = new mongoose.Types.ObjectId();
    const matches = await findMatchesForGuest(
      eventId, tenantId, guestId, embedding1, 0.5
    );

    // Should match photo1 with high confidence (identical embedding)
    const exactMatch = matches.find(
      (m) => m.photoId.toString() === photo1._id.toString()
    );
    expect(exactMatch).toBeDefined();
    expect(exactMatch.confidenceScore).toBeCloseTo(1.0, 2);
  });

  it('should not match below threshold — FR-MATCH-002', async () => {
    const { tenantId, eventId } = await setupForFace({
      email: 'nothresh@photographer.com',
      businessName: 'No Threshold Studio',
    });

    const photo = await createTestPhoto(tenantId, eventId);
    const photoEmbedding = generateEmbedding(42);

    await FaceDetection.create({
      photoId: photo._id,
      eventId,
      tenantId,
      boundingBox: { x: 0.2, y: 0.15, width: 0.3, height: 0.35 },
      confidence: 0.95,
      qualityScore: 0.9,
      embedding: photoEmbedding,
      embeddingDimensions: 128,
      provider: 'mock',
    });

    // Very different guest embedding
    const differentEmbedding = generateEmbedding(999);
    const guestId = new mongoose.Types.ObjectId();

    // Use very high threshold
    const matches = await findMatchesForGuest(
      eventId, tenantId, guestId, differentEmbedding, 0.99
    );

    // Should find no matches above 0.99 threshold
    expect(matches.length).toBe(0);
  });

  it('should be strictly event-scoped — FR-MATCH-001 / SEC-006', async () => {
    const eventA = await setupForFace({
      email: 'scope-a@photographer.com',
      businessName: 'Scope A Studio',
    });
    const eventB = await setupForFace({
      email: 'scope-b@photographer.com',
      businessName: 'Scope B Studio',
    });

    // Create face detection in Event A
    const photoA = await createTestPhoto(eventA.tenantId, eventA.eventId);
    const embedding = generateEmbedding(42);

    await FaceDetection.create({
      photoId: photoA._id,
      eventId: eventA.eventId,
      tenantId: eventA.tenantId,
      boundingBox: { x: 0.2, y: 0.15, width: 0.3, height: 0.35 },
      confidence: 0.95,
      qualityScore: 0.9,
      embedding,
      embeddingDimensions: 128,
      provider: 'mock',
    });

    // Try to match against Event B — should find nothing
    const guestId = new mongoose.Types.ObjectId();
    const matches = await findMatchesForGuest(
      eventB.eventId, eventB.tenantId, guestId, embedding, 0.5
    );

    expect(matches.length).toBe(0);
  });

  it('should log confidence scores — FR-MATCH-005', async () => {
    const { tenantId, eventId } = await setupForFace({
      email: 'confidence@photographer.com',
      businessName: 'Confidence Studio',
    });

    const photo = await createTestPhoto(tenantId, eventId);
    const embedding = generateEmbedding(42);

    await FaceDetection.create({
      photoId: photo._id,
      eventId,
      tenantId,
      boundingBox: { x: 0.2, y: 0.15, width: 0.3, height: 0.35 },
      confidence: 0.95,
      qualityScore: 0.9,
      embedding,
      embeddingDimensions: 128,
      provider: 'mock',
    });

    const guestId = new mongoose.Types.ObjectId();
    const matches = await findMatchesForGuest(
      eventId, tenantId, guestId, embedding, 0.5
    );

    // Verify confidence score is stored
    expect(matches.length).toBeGreaterThan(0);
    const dbMatch = await Match.findOne({ guestId, eventId });
    expect(dbMatch).toBeDefined();
    expect(dbMatch.confidenceScore).toBeGreaterThanOrEqual(0.5);
    expect(dbMatch.confidenceScore).toBeLessThanOrEqual(1.0);
  });
});

describe('Match Stats — FR-MON-001', () => {
  it('should return match statistics for an event', async () => {
    const { tenantId, eventId } = await setupForFace({
      email: 'stats@photographer.com',
      businessName: 'Stats Studio',
    });

    const photo = await createTestPhoto(tenantId, eventId);
    const embedding = generateEmbedding(42);

    // Create a face detection
    const fd = await FaceDetection.create({
      photoId: photo._id,
      eventId,
      tenantId,
      boundingBox: { x: 0.2, y: 0.15, width: 0.3, height: 0.35 },
      confidence: 0.95,
      qualityScore: 0.9,
      embedding,
      embeddingDimensions: 128,
      provider: 'mock',
    });

    // Create a match
    await Match.create({
      guestId: new mongoose.Types.ObjectId(),
      photoId: photo._id,
      faceDetectionId: fd._id,
      eventId,
      tenantId,
      confidenceScore: 0.92,
    });

    const stats = await getMatchStats(tenantId, eventId);
    expect(stats.totalFacesDetected).toBe(1);
    expect(stats.totalMatches).toBe(1);
    expect(stats.uniqueGuestsMatched).toBe(1);
    expect(stats.uniquePhotosMatched).toBe(1);
  });
});
