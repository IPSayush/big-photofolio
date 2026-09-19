/**
 * Profile Integration Tests.
 *
 * Tests photographer profile CRUD via HTTP:
 * - Get profile (FR-PROFILE-001/003)
 * - Update profile with versioning (FR-PROFILE-002)
 * - Audit log on profile update (SEC-007)
 * - Tenant isolation (SEC-001/SEC-002)
 */

const request = require('supertest');
const app = require('../../src/app');
const Tenant = require('../../src/models/Tenant');
const Plan = require('../../src/models/Plan');
const AuditLog = require('../../src/models/AuditLog');

const TEST_USER = {
  email: 'profile-test@photographer.com',
  password: 'StrongPass123',
  firstName: 'Jane',
  lastName: 'Smith',
  businessName: 'Jane Smith Photography',
};

/**
 * Helper: register a user and return tokens + tenant info.
 */
async function registerAndGetTokens(userData = TEST_USER) {
  const res = await request(app).post('/api/auth/register').send(userData);
  return {
    accessToken: res.body.data.tokens.accessToken,
    tenantId: res.body.data.tenant.id || res.body.data.tenant._id,
    user: res.body.data.user,
    tenant: res.body.data.tenant,
  };
}

describe('GET /api/profile', () => {
  it('should return photographer profile — FR-PROFILE-001', async () => {
    const { accessToken } = await registerAndGetTokens();

    const res = await request(app)
      .get('/api/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.profile).toBeDefined();
    expect(res.body.data.profile.businessName).toBe(TEST_USER.businessName);
    expect(res.body.data.profile.contactEmail).toBe(TEST_USER.email);
    expect(res.body.data.profile.brandingColors).toBeDefined();
    expect(res.body.data.profile.profileVersion).toBe(1);
  });

  it('should include plan and usage when plan is assigned — FR-PROFILE-003', async () => {
    const { accessToken, tenantId } = await registerAndGetTokens();

    // Create a plan and assign it to the tenant
    const plan = await Plan.create({
      name: 'Test Plan',
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

    const res = await request(app)
      .get('/api/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.data.plan).toBeDefined();
    expect(res.body.data.plan.name).toBe('Test Plan');
    expect(res.body.data.usage).toBeDefined();
    expect(res.body.data.usage.eventsUsed).toBe(0);
    expect(res.body.data.usage.eventsLimit).toBe(10);
  });

  it('should reject unauthenticated access — SEC-001', async () => {
    const res = await request(app)
      .get('/api/profile')
      .expect(401);

    expect(res.body.success).toBe(false);
  });
});

describe('PATCH /api/profile', () => {
  it('should update profile and increment version — FR-PROFILE-001/002', async () => {
    const { accessToken } = await registerAndGetTokens();

    const res = await request(app)
      .patch('/api/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ businessName: 'Updated Studio Name' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.profile.businessName).toBe('Updated Studio Name');
    expect(res.body.data.profile.profileVersion).toBe(2);
  });

  it('should update branding colors — FR-PROFILE-001', async () => {
    const { accessToken } = await registerAndGetTokens();

    const res = await request(app)
      .patch('/api/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ brandingColors: { primary: '#FF5733', secondary: '#33FF57' } })
      .expect(200);

    expect(res.body.data.profile.brandingColors.primary).toBe('#FF5733');
    expect(res.body.data.profile.brandingColors.secondary).toBe('#33FF57');
  });

  it('should create audit log on profile update — SEC-007', async () => {
    const { accessToken, tenantId } = await registerAndGetTokens();

    await request(app)
      .patch('/api/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ businessName: 'Audited Change' })
      .expect(200);

    const auditLogs = await AuditLog.find({
      action: 'profile.update',
      targetType: 'Tenant',
    });

    expect(auditLogs.length).toBe(1);
    expect(auditLogs[0].metadata.changes.businessName).toBeDefined();
    expect(auditLogs[0].metadata.newVersion).toBe(2);
  });

  it('should not increment version if no actual changes — FR-PROFILE-002', async () => {
    const { accessToken, tenant } = await registerAndGetTokens();

    const res = await request(app)
      .patch('/api/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ businessName: tenant.businessName }) // Same value
      .expect(200);

    expect(res.body.data.profile.profileVersion).toBe(1); // No increment
  });

  it('should reject empty update body', async () => {
    const { accessToken } = await registerAndGetTokens();

    const res = await request(app)
      .patch('/api/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(400);

    expect(res.body.success).toBe(false);
  });

  it('should reject invalid branding color format', async () => {
    const { accessToken } = await registerAndGetTokens();

    const res = await request(app)
      .patch('/api/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ brandingColors: { primary: 'not-a-color' } })
      .expect(400);

    expect(res.body.success).toBe(false);
  });
});
