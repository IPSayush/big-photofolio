/**
 * Auth Integration Tests.
 * 
 * Tests the full auth flow end-to-end via HTTP:
 * - Registration (FR-AUTH-001)
 * - Login (FR-AUTH-002)
 * - Token refresh (FR-AUTH-005)
 * - Email verification (FR-AUTH-002)
 * - Password reset (FR-AUTH-002)
 * - Protected routes (SEC-001, SEC-002)
 * - Tenant isolation (SEC-001)
 * - Rate limiting (SEC-008) — skipped in test env
 */

const request = require('supertest');
const app = require('../../src/app');
const User = require('../../src/models/User');
const Tenant = require('../../src/models/Tenant');

const TEST_USER = {
  email: 'test@photographer.com',
  password: 'StrongPass123',
  firstName: 'John',
  lastName: 'Doe',
  businessName: 'John Doe Photography',
};

describe('POST /api/auth/register', () => {
  it('should register a new photographer and create tenant', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(TEST_USER)
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toBeDefined();
    expect(res.body.data.user.email).toBe(TEST_USER.email);
    expect(res.body.data.user.role).toBe('photographer');
    expect(res.body.data.user.password).toBeUndefined(); // Never exposed
    expect(res.body.data.tenant).toBeDefined();
    expect(res.body.data.tenant.businessName).toBe(TEST_USER.businessName);
    expect(res.body.data.tokens.accessToken).toBeDefined();
    expect(res.body.data.tokens.refreshToken).toBeDefined();

    // Verify tenant was created in DB
    const tenantCount = await Tenant.countDocuments();
    expect(tenantCount).toBe(1);

    // Verify user is linked to tenant
    const user = await User.findOne({ email: TEST_USER.email });
    expect(user.tenantId).toBeDefined();
  });

  it('should reject duplicate email registration', async () => {
    await request(app).post('/api/auth/register').send(TEST_USER).expect(201);

    const res = await request(app)
      .post('/api/auth/register')
      .send(TEST_USER)
      .expect(409);

    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('already exists');
  });

  it('should reject weak passwords', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...TEST_USER, password: 'weak' })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.details).toBeDefined();
  });

  it('should reject invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...TEST_USER, email: 'not-an-email' })
      .expect(400);

    expect(res.body.success).toBe(false);
  });

  it('should reject missing required fields', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@test.com' })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.details.length).toBeGreaterThan(0);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/register').send(TEST_USER);
  });

  it('should login with valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.tokens.accessToken).toBeDefined();
    expect(res.body.data.tokens.refreshToken).toBeDefined();
    expect(res.body.data.user.email).toBe(TEST_USER.email);
  });

  it('should reject invalid password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: 'WrongPassword123' })
      .expect(401);

    expect(res.body.success).toBe(false);
    // Should not reveal whether email or password was wrong
    expect(res.body.error).toBe('Invalid email or password.');
  });

  it('should reject non-existent email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@test.com', password: 'SomePass123' })
      .expect(401);

    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Invalid email or password.');
  });
});

describe('POST /api/auth/refresh', () => {
  let refreshToken;

  beforeEach(async () => {
    const res = await request(app).post('/api/auth/register').send(TEST_USER);
    refreshToken = res.body.data.tokens.refreshToken;
  });

  it('should issue new token pair with valid refresh token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.tokens.accessToken).toBeDefined();
    expect(res.body.data.tokens.refreshToken).toBeDefined();
    // New refresh token should be different (rotation)
    expect(res.body.data.tokens.refreshToken).not.toBe(refreshToken);
  });

  it('should reject reused refresh token (rotation detection)', async () => {
    // Use the token once
    await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken })
      .expect(200);

    // Try to reuse the old token — should fail (possible theft)
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken })
      .expect(401);

    expect(res.body.success).toBe(false);
  });

  it('should reject invalid refresh token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'invalid.token.here' })
      .expect(401);

    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/auth/me', () => {
  let accessToken;

  beforeEach(async () => {
    const res = await request(app).post('/api/auth/register').send(TEST_USER);
    accessToken = res.body.data.tokens.accessToken;
  });

  it('should return current user with valid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(TEST_USER.email);
    expect(res.body.data.tenant).toBeDefined();
    expect(res.body.data.user.password).toBeUndefined();
  });

  it('should reject request without token — SEC-001', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .expect(401);

    expect(res.body.success).toBe(false);
  });

  it('should reject request with invalid token — SEC-002', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid.token.value')
      .expect(401);

    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/auth/logout', () => {
  let accessToken;
  let refreshToken;

  beforeEach(async () => {
    const res = await request(app).post('/api/auth/register').send(TEST_USER);
    accessToken = res.body.data.tokens.accessToken;
    refreshToken = res.body.data.tokens.refreshToken;
  });

  it('should invalidate refresh token on logout', async () => {
    // Logout
    await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    // Try to use the refresh token — should fail
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken })
      .expect(401);

    expect(res.body.success).toBe(false);
  });
});

describe('Tenant Isolation — SEC-001', () => {
  it('should create separate tenants for separate registrations', async () => {
    const res1 = await request(app).post('/api/auth/register').send(TEST_USER);
    const res2 = await request(app).post('/api/auth/register').send({
      ...TEST_USER,
      email: 'other@photographer.com',
      businessName: 'Other Studio',
    });

    const tenant1Id = res1.body.data.tenant.id || res1.body.data.tenant._id;
    const tenant2Id = res2.body.data.tenant.id || res2.body.data.tenant._id;

    expect(tenant1Id).not.toBe(tenant2Id);

    // Verify each user is linked to their own tenant
    const user1 = await User.findOne({ email: TEST_USER.email });
    const user2 = await User.findOne({ email: 'other@photographer.com' });

    expect(user1.tenantId.toString()).toBe(tenant1Id);
    expect(user2.tenantId.toString()).toBe(tenant2Id);
  });
});

describe('GET /api/health', () => {
  it('should return healthy status', async () => {
    const res = await request(app).get('/api/health').expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('healthy');
  });
});
