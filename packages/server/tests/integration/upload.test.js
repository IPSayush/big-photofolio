/**
 * Upload Integration Tests.
 *
 * Tests photo upload pipeline via HTTP:
 * - Request pre-signed upload URLs (FR-UPLOAD-002)
 * - Quota enforcement: maxPhotosPerEvent from Plan (FR-PLAN-003)
 * - File type validation (FR-UPLOAD-004)
 * - File size validation (FR-UPLOAD-004)
 * - Duplicate detection by hash (FR-UPLOAD-005)
 * - Upload confirmation for resumability (FR-UPLOAD-003)
 * - Upload status aggregation (FR-UPLOAD-007 / API-008)
 * - Cross-tenant access blocked (SEC-001)
 * - Archived event upload blocked (FR-EVENT-005)
 *
 * S3 calls return mock URLs in test mode — no AWS dependency.
 */

const request = require('supertest');
const crypto = require('crypto');
const app = require('../../src/app');
const Tenant = require('../../src/models/Tenant');
const Plan = require('../../src/models/Plan');
const Event = require('../../src/models/Event');
const Photo = require('../../src/models/Photo');
const AuditLog = require('../../src/models/AuditLog');
const { getImageProcessingQueue } = require('../../src/config/queue');

const TEST_USER = {
  email: 'upload-test@photographer.com',
  password: 'StrongPass123',
  firstName: 'Upload',
  lastName: 'Tester',
  businessName: 'Upload Test Studio',
};

/**
 * Helper: register, assign plan, create event, return tokens + IDs.
 */
async function setupForUpload(userOverrides = {}, planOverrides = {}) {
  const userData = { ...TEST_USER, ...userOverrides };
  const regRes = await request(app).post('/api/auth/register').send(userData);
  const accessToken = regRes.body.data.tokens.accessToken;
  const tenantId = regRes.body.data.tenant.id || regRes.body.data.tenant._id;

  // Create and assign plan
  const plan = await Plan.create({
    name: `Plan-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    pricing: { amount: 999, currency: 'INR', interval: 'monthly' },
    quotas: {
      maxEvents: 10,
      maxPhotosPerEvent: 100,
      maxStorageBytes: 5368709120,
      maxGuestsPerEvent: 100,
      maxAiMatchesPerMonth: 1000,
      ...planOverrides,
    },
  });
  await Tenant.findByIdAndUpdate(tenantId, { planId: plan._id });

  // Create event
  const eventRes = await request(app)
    .post('/api/events')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      name: 'Test Event',
      dateStart: '2026-12-25T18:00:00.000Z',
      venue: 'Test Venue',
      accessMode: 'link_only',
    });
  const eventId = eventRes.body.data.event.id || eventRes.body.data.event._id;

  return { accessToken, tenantId, eventId, plan };
}

/**
 * Helper: generate a mock file entry for upload URL requests.
 */
function mockFile(overrides = {}) {
  return {
    fileName: 'photo_001.jpg',
    contentType: 'image/jpeg',
    sizeBytes: 5 * 1024 * 1024, // 5 MB
    hash: crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex'),
    ...overrides,
  };
}

describe('POST /api/events/:eventId/photos/upload-url', () => {
  it('should generate pre-signed upload URLs — FR-UPLOAD-002', async () => {
    const { accessToken, eventId } = await setupForUpload();

    const files = [mockFile(), mockFile({ fileName: 'photo_002.jpg' })];

    const res = await request(app)
      .post(`/api/events/${eventId}/photos/upload-url`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ files })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.batchId).toBeDefined();
    expect(res.body.data.files).toHaveLength(2);

    // Each file should have a pre-signed URL and photo ID
    for (const file of res.body.data.files) {
      expect(file.uploadUrl).toBeDefined();
      expect(file.uploadUrl).toContain('s3.');
      expect(file.photoId).toBeDefined();
      expect(file.s3Key).toContain('originals/');
      expect(file.isDuplicate).toBe(false);
    }

    // Photo records should exist in DB
    const photoCount = await Photo.countDocuments({ eventId });
    expect(photoCount).toBe(2);
  });

  it('should enforce maxPhotosPerEvent quota from Plan — FR-PLAN-003', async () => {
    const { accessToken, eventId } = await setupForUpload({}, { maxPhotosPerEvent: 2 });

    // Upload 2 files (at limit)
    await request(app)
      .post(`/api/events/${eventId}/photos/upload-url`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ files: [mockFile(), mockFile({ fileName: 'p2.jpg' })] })
      .expect(200);

    // Try to upload 1 more — should be blocked
    const res = await request(app)
      .post(`/api/events/${eventId}/photos/upload-url`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ files: [mockFile({ fileName: 'p3.jpg' })] })
      .expect(403);

    expect(res.body.code).toBe('PHOTO_QUOTA_EXCEEDED');
  });

  it('should reject disallowed file types — FR-UPLOAD-004', async () => {
    const { accessToken, eventId } = await setupForUpload();

    const res = await request(app)
      .post(`/api/events/${eventId}/photos/upload-url`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ files: [mockFile({ contentType: 'application/pdf' })] })
      .expect(400);

    expect(res.body.code).toBe('FILE_VALIDATION_FAILED');
    expect(res.body.details).toBeDefined();
    expect(res.body.details[0].error).toContain('not allowed');
  });

  it('should reject oversized files — FR-UPLOAD-004', async () => {
    const { accessToken, eventId } = await setupForUpload();

    const res = await request(app)
      .post(`/api/events/${eventId}/photos/upload-url`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ files: [mockFile({ sizeBytes: 100 * 1024 * 1024 })] }) // 100 MB
      .expect(400);

    expect(res.body.code).toBe('FILE_VALIDATION_FAILED');
    expect(res.body.details[0].error).toContain('exceeds maximum');
  });

  it('should detect duplicate files by hash — FR-UPLOAD-005', async () => {
    const { accessToken, eventId } = await setupForUpload();

    const duplicateHash = crypto.createHash('sha256').update('duplicate-content').digest('hex');
    const file1 = mockFile({ hash: duplicateHash, fileName: 'original.jpg' });
    const file2 = mockFile({ fileName: 'unique.jpg' });

    // First upload
    await request(app)
      .post(`/api/events/${eventId}/photos/upload-url`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ files: [file1, file2] })
      .expect(200);

    // Second upload with same hash
    const res = await request(app)
      .post(`/api/events/${eventId}/photos/upload-url`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ files: [mockFile({ hash: duplicateHash, fileName: 'copy.jpg' })] })
      .expect(200);

    // Should be flagged as duplicate
    expect(res.body.data.files[0].isDuplicate).toBe(true);
    expect(res.body.data.files[0].uploadUrl).toBeNull();
    expect(res.body.data.files[0].photoId).toBeNull();
  });

  it('should detect duplicates within the same batch — FR-UPLOAD-005', async () => {
    const { accessToken, eventId } = await setupForUpload();

    const sameHash = crypto.createHash('sha256').update('same-file').digest('hex');

    const res = await request(app)
      .post(`/api/events/${eventId}/photos/upload-url`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        files: [
          mockFile({ hash: sameHash, fileName: 'first.jpg' }),
          mockFile({ hash: sameHash, fileName: 'second.jpg' }),
        ],
      })
      .expect(200);

    // First should succeed, second should be duplicate
    expect(res.body.data.files[0].isDuplicate).toBe(false);
    expect(res.body.data.files[1].isDuplicate).toBe(true);
  });

  it('should reject upload to archived event — FR-EVENT-005', async () => {
    const { accessToken, eventId } = await setupForUpload();

    // Archive the event
    await request(app)
      .post(`/api/events/${eventId}/archive`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const res = await request(app)
      .post(`/api/events/${eventId}/photos/upload-url`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ files: [mockFile()] })
      .expect(400);

    expect(res.body.code).toBe('EVENT_ARCHIVED');
  });

  it('should create audit log — SEC-007', async () => {
    const { accessToken, eventId } = await setupForUpload();

    await request(app)
      .post(`/api/events/${eventId}/photos/upload-url`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ files: [mockFile()] })
      .expect(200);

    const logs = await AuditLog.find({ action: 'photo.upload_urls_requested' });
    expect(logs.length).toBe(1);
    expect(logs[0].metadata.batchId).toBeDefined();
    expect(logs[0].metadata.newPhotos).toBe(1);
  });

  it('should update event photo count — FR-EVENT-006', async () => {
    const { accessToken, eventId } = await setupForUpload();

    await request(app)
      .post(`/api/events/${eventId}/photos/upload-url`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ files: [mockFile(), mockFile({ fileName: 'p2.jpg' })] })
      .expect(200);

    const eventRes = await request(app)
      .get(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(eventRes.body.data.event.stats.photoCount).toBe(2);
  });

  it('should reject unauthenticated access — SEC-001', async () => {
    const { eventId } = await setupForUpload();

    await request(app)
      .post(`/api/events/${eventId}/photos/upload-url`)
      .send({ files: [mockFile()] })
      .expect(401);
  });

  it('should block cross-tenant access — SEC-001/SEC-002', async () => {
    const tenantA = await setupForUpload();
    const tenantB = await setupForUpload({
      email: 'other-upload@photographer.com',
      businessName: 'Other Upload Studio',
    });

    // Tenant B tries to upload to Tenant A's event
    const res = await request(app)
      .post(`/api/events/${tenantA.eventId}/photos/upload-url`)
      .set('Authorization', `Bearer ${tenantB.accessToken}`)
      .send({ files: [mockFile()] })
      .expect(404);

    expect(res.body.code).toBe('EVENT_NOT_FOUND');
  });

  it('should reject invalid hash format', async () => {
    const { accessToken, eventId } = await setupForUpload();

    const res = await request(app)
      .post(`/api/events/${eventId}/photos/upload-url`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ files: [mockFile({ hash: 'not-a-valid-hash' })] })
      .expect(400);

    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/events/:eventId/photos/confirm', () => {
  it('should confirm uploads and enqueue for processing — FR-UPLOAD-003 / FR-PIPE-001', async () => {
    const { accessToken, eventId } = await setupForUpload();

    // Request upload URLs
    const uploadRes = await request(app)
      .post(`/api/events/${eventId}/photos/upload-url`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ files: [mockFile(), mockFile({ fileName: 'p2.jpg' })] })
      .expect(200);

    const photoIds = uploadRes.body.data.files
      .filter((f) => !f.isDuplicate)
      .map((f) => f.photoId);

    // Clear mock queue
    const queue = getImageProcessingQueue();
    queue.clearJobs();

    // Confirm uploads
    const res = await request(app)
      .post(`/api/events/${eventId}/photos/confirm`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ photoIds })
      .expect(200);

    expect(res.body.data.confirmed).toBe(2);
    expect(res.body.data.enqueued).toBe(2);

    // Verify photos confirmed in DB
    const confirmedPhotos = await Photo.find({ uploadConfirmed: true });
    expect(confirmedPhotos).toHaveLength(2);

    // FR-PIPE-001: Verify jobs enqueued
    const jobs = queue.getJobs();
    expect(jobs).toHaveLength(2);
    expect(jobs[0].name).toBe('process-photo');
    expect(jobs[0].data.photoId).toBeDefined();
    expect(jobs[0].data.tenantId).toBeDefined();
    expect(jobs[0].data.eventId).toBeDefined();
    expect(jobs[0].data.s3OriginalKey).toBeDefined();

    // Status should be 'validating' after enqueue
    const validatingPhotos = await Photo.find({ status: 'validating' });
    expect(validatingPhotos).toHaveLength(2);
  });

  it('should not confirm photos from another tenant — SEC-001', async () => {
    const tenantA = await setupForUpload();
    const tenantB = await setupForUpload({
      email: 'confirm-other@photographer.com',
      businessName: 'Confirm Other Studio',
    });

    // Tenant A uploads
    const uploadRes = await request(app)
      .post(`/api/events/${tenantA.eventId}/photos/upload-url`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ files: [mockFile()] })
      .expect(200);

    const photoId = uploadRes.body.data.files[0].photoId;

    // Tenant B tries to confirm Tenant A's photo
    const res = await request(app)
      .post(`/api/events/${tenantA.eventId}/photos/confirm`)
      .set('Authorization', `Bearer ${tenantB.accessToken}`)
      .send({ photoIds: [photoId] })
      .expect(200);

    // Should confirm 0 (no matching photos for Tenant B's tenant)
    expect(res.body.data.confirmed).toBe(0);
  });
});

describe('GET /api/events/:eventId/photos/status', () => {
  it('should return upload status counts — FR-UPLOAD-007', async () => {
    const { accessToken, eventId } = await setupForUpload();

    // Upload some photos
    await request(app)
      .post(`/api/events/${eventId}/photos/upload-url`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ files: [mockFile(), mockFile({ fileName: 'p2.jpg' }), mockFile({ fileName: 'p3.jpg' })] })
      .expect(200);

    const res = await request(app)
      .get(`/api/events/${eventId}/photos/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.data.total).toBe(3);
    expect(res.body.data.uploaded).toBe(3);
    expect(res.body.data.processing).toBe(0);
    expect(res.body.data.processed).toBe(0);
    expect(res.body.data.failed).toBe(0);
    expect(res.body.data.unconfirmed).toBe(3);
    expect(res.body.data.confirmed).toBe(0);
  });

  it('should reflect confirmed status — FR-UPLOAD-003', async () => {
    const { accessToken, eventId } = await setupForUpload();

    const uploadRes = await request(app)
      .post(`/api/events/${eventId}/photos/upload-url`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ files: [mockFile(), mockFile({ fileName: 'p2.jpg' })] })
      .expect(200);

    // Confirm one photo
    const firstPhotoId = uploadRes.body.data.files[0].photoId;
    await request(app)
      .post(`/api/events/${eventId}/photos/confirm`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ photoIds: [firstPhotoId] })
      .expect(200);

    const res = await request(app)
      .get(`/api/events/${eventId}/photos/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    // After confirm, status becomes 'validating' so confirmed count = 0 for uploaded
    // and the photo that was NOT confirmed stays as 'uploaded'
    expect(res.body.data.unconfirmed).toBe(1);
  });
});

describe('GET /api/events/:eventId/photos', () => {
  it('should list photos for the event', async () => {
    const { accessToken, eventId } = await setupForUpload();

    await request(app)
      .post(`/api/events/${eventId}/photos/upload-url`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ files: [mockFile(), mockFile({ fileName: 'p2.jpg' })] })
      .expect(200);

    const res = await request(app)
      .get(`/api/events/${eventId}/photos`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.data.photos).toHaveLength(2);
    expect(res.body.data.pagination.total).toBe(2);
    // S3 keys should NOT be exposed
    for (const photo of res.body.data.photos) {
      expect(photo.s3OriginalKey).toBeUndefined();
    }
  });

  it('should not list another tenant\'s photos — SEC-001', async () => {
    const tenantA = await setupForUpload();
    const tenantB = await setupForUpload({
      email: 'list-other@photographer.com',
      businessName: 'List Other Studio',
    });

    await request(app)
      .post(`/api/events/${tenantA.eventId}/photos/upload-url`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ files: [mockFile()] })
      .expect(200);

    // Tenant B tries to list Tenant A's photos
    const res = await request(app)
      .get(`/api/events/${tenantA.eventId}/photos`)
      .set('Authorization', `Bearer ${tenantB.accessToken}`)
      .expect(404);

    expect(res.body.code).toBe('EVENT_NOT_FOUND');
  });
});

describe('POST /api/events/:eventId/photos/retry', () => {
  it('should retry failed photos — FR-PIPE-004', async () => {
    const { accessToken, eventId, tenantId } = await setupForUpload();

    // Upload and get photo IDs
    const uploadRes = await request(app)
      .post(`/api/events/${eventId}/photos/upload-url`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ files: [mockFile(), mockFile({ fileName: 'p2.jpg' })] })
      .expect(200);

    const photoIds = uploadRes.body.data.files.map((f) => f.photoId);

    // Manually set photos to failed status
    await Photo.updateMany(
      { _id: { $in: photoIds } },
      { $set: { status: 'failed', failureReason: 'Test failure' } }
    );

    // Clear mock queue
    const queue = getImageProcessingQueue();
    queue.clearJobs();

    // Retry
    const res = await request(app)
      .post(`/api/events/${eventId}/photos/retry`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ photoIds })
      .expect(200);

    expect(res.body.data.retried).toBe(2);

    // Status should be reset to validating
    const retriedPhotos = await Photo.find({ _id: { $in: photoIds } });
    for (const photo of retriedPhotos) {
      expect(photo.status).toBe('validating');
      expect(photo.failureReason).toBeNull();
    }

    // Jobs should be enqueued
    const jobs = queue.getJobs();
    expect(jobs).toHaveLength(2);
  });

  it('should only retry photos that are actually failed', async () => {
    const { accessToken, eventId } = await setupForUpload();

    const uploadRes = await request(app)
      .post(`/api/events/${eventId}/photos/upload-url`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ files: [mockFile()] })
      .expect(200);

    const photoId = uploadRes.body.data.files[0].photoId;

    // Photo is still 'uploaded', not 'failed'
    const res = await request(app)
      .post(`/api/events/${eventId}/photos/retry`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ photoIds: [photoId] })
      .expect(200);

    // Should retry 0 since the photo isn't failed
    expect(res.body.data.retried).toBe(0);
  });

  it('should create audit log on retry — SEC-007', async () => {
    const { accessToken, eventId } = await setupForUpload();

    const uploadRes = await request(app)
      .post(`/api/events/${eventId}/photos/upload-url`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ files: [mockFile()] })
      .expect(200);

    const photoId = uploadRes.body.data.files[0].photoId;
    await Photo.findByIdAndUpdate(photoId, { status: 'failed', failureReason: 'Test' });

    await request(app)
      .post(`/api/events/${eventId}/photos/retry`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ photoIds: [photoId] })
      .expect(200);

    const logs = await AuditLog.find({ action: 'photo.retry_processing' });
    expect(logs.length).toBe(1);
    expect(logs[0].metadata.retriedCount).toBe(1);
  });

  it('should block cross-tenant retry — SEC-001', async () => {
    const tenantA = await setupForUpload();
    const tenantB = await setupForUpload({
      email: 'retry-other@photographer.com',
      businessName: 'Retry Other Studio',
    });

    const uploadRes = await request(app)
      .post(`/api/events/${tenantA.eventId}/photos/upload-url`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ files: [mockFile()] })
      .expect(200);

    const photoId = uploadRes.body.data.files[0].photoId;
    await Photo.findByIdAndUpdate(photoId, { status: 'failed' });

    // Tenant B tries to retry Tenant A's failed photo
    const res = await request(app)
      .post(`/api/events/${tenantA.eventId}/photos/retry`)
      .set('Authorization', `Bearer ${tenantB.accessToken}`)
      .send({ photoIds: [photoId] })
      .expect(404);

    expect(res.body.code).toBe('EVENT_NOT_FOUND');
  });
});
